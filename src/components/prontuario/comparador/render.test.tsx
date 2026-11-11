import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { renderToString } from 'react-dom/server'
import { ComparadorSlider } from './ComparadorSlider'
import { TabComparador } from './TabComparador'
import type { AuthClinic, Patient } from '@/types'

describe('aba Antes e depois', () => {
  it('slider expõe role=slider com valor e rótulos Antes/Depois com data', () => {
    const html = renderToString(
      <ComparadorSlider before={{ url: 'https://x/a.jpg', date: '10/01/2026' }} after={{ url: 'https://x/b.jpg', date: '10/03/2026' }} />,
    )
    expect(html).toContain('role="slider"')
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('10/01/2026')
    expect(html).toContain('10/03/2026')
    expect(html).toContain('Antes')
    expect(html).toContain('Depois')
  })
  it('sem fotos mostra o estado vazio com instrução', () => {
    const html = renderToString(
      <TabComparador patient={{ id: 'p', name: 'Ana' } as Patient} clinic={{ id: 'c', name: 'Clínica', type: 'estetica' } as AuthClinic} entries={[]} entriesLoading={false} />,
    )
    expect(html).toContain('Nenhuma foto no prontuário ainda')
    expect(html).toContain('Evolução')
    expect(html).not.toContain('role="slider"')
  })
})
