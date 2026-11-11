import type { Metadata } from 'next'

// Verificador de documentos: fora de buscadores, sem cache e sem repassar o endereço (que carrega o token).
export const metadata: Metadata = {
  title: 'Verificação de documento',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default function VerifyPublicLayout({ children }: { children: React.ReactNode }) {
  return children
}
