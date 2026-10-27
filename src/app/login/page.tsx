import { Suspense } from 'react'
import { AuthFlow } from './AuthFlow'

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }} />}>
      <AuthFlow variant="login" />
    </Suspense>
  )
}
