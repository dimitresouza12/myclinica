import type { Metadata } from 'next'

// Página pessoal do paciente: fora de buscadores, sem cache e sem repassar o endereço (que carrega o token).
export const metadata: Metadata = {
  title: 'Área do paciente',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default function PatientPublicLayout({ children }: { children: React.ReactNode }) {
  return children
}
