import { Suspense } from 'react'
import { AuthFlow } from '../login/AuthFlow'

export const metadata = { title: 'Teste grátis por 7 dias | MyClínica' }

export default function ExperimentarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh' }} />}>
      <AuthFlow variant="demo" />
    </Suspense>
  )
}
