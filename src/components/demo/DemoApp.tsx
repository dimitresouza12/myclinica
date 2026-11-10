'use client'
import { Icon, type IconName } from '@/components/ui/Icon'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { AreaTrendChart, type TrendPoint } from '@/components/ui/AreaTrendChart'
import { BarList } from '@/components/ui/BarList'
import { moneyShort, axisMoney } from '@/lib/ui/money'
import nav from '@/components/layout/AppSidebar.module.css'
import { Logotype } from '@/components/login/Logotype'
import styles from './demoApp.module.css'

// Dados FICTÍCIOS e fixos: esta tela é pública (sem login) e nunca toca o banco.
const GROUPS: { title: string | null; items: { label: string; icon: IconName }[] }[] = [
  { title: null, items: [{ label: 'Dashboard', icon: 'dashboard' }] },
  { title: 'Dia a dia', items: [{ label: 'Agenda', icon: 'calendar' }, { label: 'Pacientes', icon: 'patients' }, { label: 'Mensagens', icon: 'messages' }] },
  { title: 'Gestão', items: [{ label: 'Financeiro', icon: 'wallet' }, { label: 'Comissões', icon: 'percent' }, { label: 'Metas', icon: 'target' }, { label: 'Relatórios', icon: 'reports' }] },
  { title: 'Clínica', items: [{ label: 'Procedimentos', icon: 'procedures' }, { label: 'Estoque', icon: 'stock' }, { label: 'Equipe', icon: 'team' }] },
]

const MONTHS = ['nov', 'dez', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out']
const REVENUE = [28, 31, 30, 35, 33, 38, 41, 40, 44, 46, 45, 48].map(v => v * 1000)
const BEFORE = [22, 24, 25, 27, 27, 30, 31, 33, 34, 36, 37, 40].map(v => v * 1000)
const TREND: TrendPoint[] = MONTHS.map((label, i) => ({ label, value: REVENUE[i], compare: BEFORE[i] }))

const TOP = [
  { label: 'Limpeza e profilaxia', value: 62 },
  { label: 'Consulta de retorno', value: 48 },
  { label: 'Clareamento', value: 27 },
  { label: 'Restauração', value: 21 },
  { label: 'Avaliação inicial', value: 16 },
]

/** Fundo da tela "Teste grátis": um dashboard de exemplo, só para ser visto desfocado atrás do quiz. */
export function DemoApp() {
  return (
    <div className={styles.shell} aria-hidden="true" inert>
      <aside className={nav.sidebar}>
        <div className={nav.brand}>
          <Logotype className={nav.brandLogotype} />
          <div className={nav.clinic}>
            <span className={nav.clinicMark}>C</span>
            <span className={nav.clinicText}><b>Clínica Exemplo</b></span>
          </div>
        </div>
        <nav className={nav.nav}>
          {GROUPS.map((g, i) => (
            <div key={g.title ?? i} className={nav.group}>
              {g.title && <span className={nav.groupTitle}>{g.title}</span>}
              {g.items.map(it => (
                <span key={it.label} className={`${nav.navItem} ${it.label === 'Dashboard' ? nav.active : ''}`}>
                  <span className={nav.iconWrap}><Icon name={it.icon} size={16} /></span>
                  <span className={nav.navLabel}>{it.label}</span>
                </span>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className={styles.main}>
        <PageHeader title="Dashboard" subtitle="Visão geral da clínica" />
        <div className={styles.stats}>
          <StatCard title="Consultas hoje" value={14} hint="3 para confirmar" spark={{ values: [8, 11, 9, 13, 12, 10, 14], label: 'Consultas por dia nos últimos 7 dias' }} />
          <StatCard title="Pacientes ativos" value={318} delta={{ label: '+12' }} hint="12 novos neste mês" spark={{ values: [290, 294, 298, 303, 307, 312, 318], label: 'Pacientes ativos nos últimos 7 dias' }} />
          <StatCard title="Receita do mês" value="R$ 48,2 mil" compact delta={{ label: '+18%' }} hint="comparado ao mês passado" />
          <StatCard title="Ticket médio" value="R$ 340" compact hint="142 atendimentos concluídos" />
        </div>
        <div className={styles.row}>
          <Card title="Receita dos últimos 12 meses">
            <AreaTrendChart data={TREND} highlightIndex={11} valueName="Receita" compareName="Ano anterior" formatValue={moneyShort} formatAxis={axisMoney} height={220} label="Receita mensal comparada com o ano anterior" />
          </Card>
          <Card title="Procedimentos mais feitos">
            <BarList items={TOP} format={n => `${n}`} />
          </Card>
        </div>
      </div>
    </div>
  )
}
