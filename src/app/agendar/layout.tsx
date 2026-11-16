import type { Metadata } from 'next'

// Página pública de cada clínica: não indexa (são muitas, com pouco conteúdo) e não repassa o endereço.
export const metadata: Metadata = {
  title: 'Agendar consulta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function AgendarLayout({ children }: { children: React.ReactNode }) {
  return children
}
