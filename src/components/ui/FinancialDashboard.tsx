'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'

/* ─── Data ──────────────────────────────────────────────────────────── */
const monthlyData = [
  { month: 'Jan', value: 42000 },
  { month: 'Fev', value: 38500 },
  { month: 'Mar', value: 57000 },
  { month: 'Abr', value: 47200 },
  { month: 'Mai', value: 65800 },
  { month: 'Jun', value: 58400 },
  { month: 'Jul', value: 74600 },
  { month: 'Ago', value: 68000 },
]

const weeklyData = [
  { day: 'Seg', value: 3200 },
  { day: 'Ter', value: 4850 },
  { day: 'Qua', value: 3700 },
  { day: 'Qui', value: 6200 },
  { day: 'Sex', value: 5100 },
  { day: 'Sáb', value: 2800 },
  { day: 'Dom', value: 1950 },
]

const donutData = [
  { name: 'SaaS Pro',   value: 45 },
  { name: 'Enterprise', value: 30 },
  { name: 'Starter',    value: 15 },
  { name: 'Outros',     value: 10 },
]

const DONUT_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706']

const topClients = [
  { name: 'TechCorp Ltda', plan: 'Enterprise', mrr: 'R$ 15.000', growth: '+5%',  pct: 100 },
  { name: 'StartupHub',    plan: 'SaaS Pro',   mrr: 'R$ 8.200',  growth: '+22%', pct: 55  },
  { name: 'DevAgency',     plan: 'SaaS Pro',   mrr: 'R$ 6.850',  growth: '+15%', pct: 46  },
  { name: 'FinTech SA',    plan: 'Enterprise', mrr: 'R$ 12.400', growth: '+8%',  pct: 83  },
  { name: 'Makers Studio', plan: 'Starter',    mrr: 'R$ 2.400',  growth: '+31%', pct: 16  },
]

/* ─── Helpers ───────────────────────────────────────────────────────── */
const fmtFull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/* ─── Custom Tooltip ────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #f1f5f9',
      borderRadius: 14, padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
    }}>
      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 15, color: '#0f172a', fontWeight: 900 }}>{fmtFull(payload[0].value)}</p>
    </div>
  )
}

/* ─── Rounded Gradient Bar for Recharts ─────────────────────────────── */
const RoundedBar = (props: any) => {
  const { x, y, width, height, fill, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(8, width / 3)
  const delay = `${(index ?? 0) * 0.06}s`
  return (
    <path
      d={`M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height}Z`}
      fill={fill}
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `barGrow 0.65s cubic-bezier(0.22, 1, 0.36, 1) ${delay} both`,
      } as React.CSSProperties}
    />
  )
}

/* ─── Weekly Rounded Bar with hover ────────────────────────────────── */
const WeeklyRoundedBar = (props: any) => {
  const { x, y, width, height, fill, index } = props
  if (!height || height <= 0) return null
  const r = Math.min(5, width / 3)
  const delay = `${(index ?? 0) * 0.07}s`
  return (
    <path
      d={`M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height}Z`}
      fill={fill}
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `barGrow 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${delay} both`,
      } as React.CSSProperties}
    />
  )
}

/* ─── Fade-up item wrapper ──────────────────────────────────────────── */
const FadeUp = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ type: 'spring', stiffness: 90, damping: 18, delay }}
  >
    {children}
  </motion.div>
)

/* ─── MAIN COMPONENT ────────────────────────────────────────────────── */
export default function FinancialDashboard() {
  const [phase, setPhase] = useState<'skeleton' | 'reveal'>('skeleton')
  const [hoverBar, setHoverBar] = useState<number | null>(3)
  const [chartsReady, setChartsReady] = useState(false)

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('reveal'), 1500)
    const t2 = window.setTimeout(() => setChartsReady(true), 1800)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [])

  const metrics = [
    {
      label: 'Receita Total', value: 'R$ 452.100', change: '+18,2%',
      spark: 74, gradient: 'from-violet-500 to-purple-700', blob: '#7C3AED',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round"/></svg>,
    },
    {
      label: 'Assinaturas Ativas', value: '2.847', change: '+12,5%',
      spark: 62, gradient: 'from-blue-500 to-cyan-400', blob: '#2563EB',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round"/></svg>,
    },
    {
      label: 'Churn Rate', value: '2,4%', change: '-0,8%',
      spark: 38, gradient: 'from-emerald-500 to-teal-400', blob: '#059669',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
  ]

  /* ── SKELETON ─────────────────────────────────────────────────────── */
  if (phase === 'skeleton') {
    return (
      <div className="min-h-screen p-6 sm:p-8" style={{ background: '#F1F5FB', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
          @keyframes shimmer {
            0%   { background-position: -400% 0; }
            100% { background-position:  400% 0; }
          }
        `}</style>
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <ShimmerBox w={200} h={28} r={10} />
              <ShimmerBox w={160} h={14} r={8} />
            </div>
            <ShimmerBox w={110} h={38} r={12} />
          </div>
          {/* Cards */}
          <div className="grid grid-cols-3 gap-4">
            {[0,1,2].map(i => (
              <div key={i} className="bg-white rounded-3xl p-6" style={{ boxShadow: '0 2px 16px rgba(15,23,42,0.05)', border: '1px solid #f1f5f9' }}>
                <div className="flex justify-between mb-4">
                  <ShimmerBox w={120} h={12} r={6} />
                  <ShimmerBox w={36} h={36} r={10} />
                </div>
                <ShimmerBox w={150} h={32} r={8} />
                <div className="mt-2"><ShimmerBox w={90} h={12} r={6} /></div>
                <div className="mt-4"><ShimmerBox w="100%" h={4} r={99} /></div>
              </div>
            ))}
          </div>
          {/* Charts */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>
            <div className="bg-white rounded-3xl p-6" style={{ boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
              <ShimmerBox w={160} h={16} r={8} />
              <div className="mt-6"><ShimmerBox w="100%" h={210} r={12} /></div>
            </div>
            <div className="bg-white rounded-3xl p-6" style={{ boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
              <ShimmerBox w={130} h={16} r={8} />
              <div className="mt-6"><ShimmerBox w="100%" h={210} r={12} /></div>
            </div>
          </div>
          {/* Bottom */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 3fr' }}>
            <div className="bg-white rounded-3xl p-6" style={{ boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
              <ShimmerBox w={150} h={16} r={8} />
              <div className="mt-4"><ShimmerBox w="100%" h={180} r={12} /></div>
            </div>
            <div className="bg-white rounded-3xl p-6" style={{ boxShadow: '0 2px 16px rgba(15,23,42,0.05)' }}>
              <ShimmerBox w={120} h={16} r={8} />
              <div className="mt-4 space-y-3">
                {[0,1,2,3,4].map(i => <ShimmerBox key={i} w="100%" h={44} r={10} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── DASHBOARD ────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ background: '#F1F5FB', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to   { transform: scaleY(1); opacity: 1; }
        }
        @keyframes shimmer {
          0%   { background-position: -400% 0; }
          100% { background-position:  400% 0; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────── */}
        <FadeUp delay={0} className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5, margin: 0 }}>
              Painel Financeiro
            </h1>
            <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>
              Agosto 2025 · Atualizado agora há pouco
            </p>
          </div>
          <motion.button
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#7C3AED', color: '#fff',
              border: 'none', borderRadius: 12, padding: '10px 20px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(124,58,237,0.3)',
              fontFamily: 'inherit',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
              <path d="M12 4v16m8-8H4" strokeLinecap="round"/>
            </svg>
            Exportar
          </motion.button>
        </FadeUp>

        {/* ── 3 Metric Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {metrics.map((m, i) => (
            <FadeUp key={i} delay={0.08 + i * 0.08}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  background: '#fff', borderRadius: 24, padding: 24,
                  boxShadow: '0 2px 16px rgba(15,23,42,0.05)',
                  border: '1px solid #f1f5f9', position: 'relative', overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                {/* Blob */}
                <div style={{
                  position: 'absolute', top: -24, right: -24, width: 80, height: 80,
                  borderRadius: '50%', background: m.blob, opacity: 0.07,
                }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                    {m.label}
                  </span>
                  <div className={`bg-gradient-to-br ${m.gradient}`} style={{
                    width: 36, height: 36, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}>
                    {m.icon}
                  </div>
                </div>

                <p style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: -1, margin: 0, lineHeight: 1 }}>
                  {m.value}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '2px 6px', borderRadius: 6 }}>
                    {m.change}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>vs mês anterior</span>
                </div>

                {/* Spark bar */}
                <div style={{ marginTop: 14, height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    className={`bg-gradient-to-r ${m.gradient}`}
                    style={{ height: '100%', borderRadius: 99 }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${m.spark}%` }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </motion.div>
            </FadeUp>
          ))}
        </div>

        {/* ── Charts Row ─────────────────────────────────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>

          {/* Main Revenue — 60% */}
          <FadeUp delay={0.28}>
            <div style={{
              background: '#fff', borderRadius: 24, padding: 24,
              boxShadow: '0 2px 16px rgba(15,23,42,0.05)', border: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Receita Mensal</h2>
                  <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>Jan — Ago 2025</p>
                </div>
                <div style={{ display: 'flex', gap: 2, background: '#f8fafc', borderRadius: 10, padding: 4, border: '1px solid #f1f5f9' }}>
                  {['3M','6M','1A','Tudo'].map((p, i) => (
                    <button key={p} style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: i === 2 ? '#fff' : 'transparent',
                      color: i === 2 ? '#0f172a' : '#94a3b8',
                      boxShadow: i === 2 ? '0 1px 4px rgba(15,23,42,0.08)' : 'none',
                    }}>{p}</button>
                  ))}
                </div>
              </div>

              {chartsReady && (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={monthlyData} barSize={30} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      {[0,1,2].map(i => (
                        <linearGradient key={i} id={`mGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={['#8B5CF6','#7C3AED','#6D28D9'][i]} />
                          <stop offset="100%" stopColor={['#3B82F6','#2563EB','#60A5FA'][i]} stopOpacity={0.9} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v/1000}k`} dx={-2} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', radius: 8 } as any} />
                    <Bar dataKey="value" shape={<RoundedBar />} isAnimationActive={false}>
                      {monthlyData.map((_, i) => (
                        <Cell key={i} fill={`url(#mGrad${i % 3})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </FadeUp>

          {/* Weekly — 40% */}
          <FadeUp delay={0.36}>
            <div style={{
              background: '#fff', borderRadius: 24, padding: 24,
              boxShadow: '0 2px 16px rgba(15,23,42,0.05)', border: '1px solid #f1f5f9',
            }}>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Vendas Semanais</h2>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>Esta semana · Hoje: Qui</p>
              </div>

              {chartsReady && (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={weeklyData}
                    barSize={22}
                    margin={{ top: 6, right: 4, left: -28, bottom: 0 }}
                    onMouseLeave={() => setHoverBar(null)}
                  >
                    <defs>
                      <linearGradient id="wHot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0.9} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v/1000}k`} dx={-2} />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Bar
                      dataKey="value"
                      shape={<WeeklyRoundedBar />}
                      isAnimationActive={false}
                      onMouseEnter={(_: any, i: number) => setHoverBar(i)}
                    >
                      {weeklyData.map((_, i) => (
                        <Cell key={i} fill={i === hoverBar ? 'url(#wHot)' : '#E2E8F0'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </FadeUp>
        </div>

        {/* ── Bottom Row ─────────────────────────────────────────── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 3fr' }}>

          {/* Semi-Donut */}
          <FadeUp delay={0.44}>
            <div style={{
              background: '#fff', borderRadius: 24, padding: 24,
              boxShadow: '0 2px 16px rgba(15,23,42,0.05)', border: '1px solid #f1f5f9',
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Receita por Plano</h2>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3, marginBottom: 0 }}>Distribuição atual</p>

              <div style={{ position: 'relative' }}>
                {chartsReady && (
                  <ResponsiveContainer width="100%" height={152}>
                    <PieChart>
                      <defs>
                        {DONUT_COLORS.map((c, i) => (
                          <linearGradient key={i} id={`dg${i}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={c} />
                            <stop offset="100%" stopColor={c} stopOpacity={0.75} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={donutData}
                        cx="50%" cy="88%"
                        startAngle={180} endAngle={0}
                        innerRadius={52} outerRadius={76}
                        paddingAngle={3}
                        dataKey="value"
                        animationBegin={200}
                        animationDuration={900}
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={`url(#dg${i})`} stroke="none" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div style={{
                  position: 'absolute', bottom: 16, left: 0, right: 0,
                  textAlign: 'center', pointerEvents: 'none',
                }}>
                  <p style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1 }}>R$ 452K</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginTop: 3 }}>ARR Total</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 8 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* Top Clients */}
          <FadeUp delay={0.52}>
            <div style={{
              background: '#fff', borderRadius: 24, padding: 24,
              boxShadow: '0 2px 16px rgba(15,23,42,0.05)', border: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Clientes</h2>
                  <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 3 }}>Maior MRR · Este mês</p>
                </div>
                <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 700, cursor: 'pointer' }}>Ver todos →</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topClients.map((c, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.07, type: 'spring', stiffness: 100, damping: 18 }}
                    whileHover={{ backgroundColor: '#f8fafc', x: 2 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 14, cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 900, color: '#475569',
                      border: '1px solid #e2e8f0',
                    }}>
                      {c.name.slice(0,2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 1 }}>{c.plan}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', margin: 0 }}>{c.mrr}</p>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#059669', marginTop: 1 }}>{c.growth}</p>
                    </div>
                    <div style={{ width: 60, height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                      <motion.div
                        style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(to right, #7C3AED, #2563EB)' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${c.pct}%` }}
                        transition={{ delay: 0.7 + i * 0.08, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>

      </div>
    </div>
  )
}

/* ─── Shimmer Box (pure CSS, no FM) ────────────────────────────────── */
function ShimmerBox({ w, h, r }: { w: number | string; h: number; r: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
      backgroundSize: '400% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
    }} />
  )
}
