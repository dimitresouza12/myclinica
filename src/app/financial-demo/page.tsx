'use client'

import Script from 'next/script'
import dynamic from 'next/dynamic'

const Dashboard = dynamic(
  () => import('@/components/ui/FinancialDashboard'),
  { ssr: false }
)

export default function FinancialDemoPage() {
  return (
    <>
      <Script
        src="https://cdn.tailwindcss.com"
        strategy="beforeInteractive"
      />
      <Dashboard />
    </>
  )
}
