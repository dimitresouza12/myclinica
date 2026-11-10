'use client'
import { create } from 'zustand'

// Só a abertura do seletor de área no modo "trocar" (a conta de demonstração já tem uma
// área escolhida). Fica fora do store de auth porque aquele é persistido no navegador e
// um modal aberto não deve voltar sozinho depois de recarregar.
interface DemoPickerState {
  switching: boolean
  openSwitch: () => void
  closeSwitch: () => void
}

export const useDemoPicker = create<DemoPickerState>((set) => ({
  switching: false,
  openSwitch: () => set({ switching: true }),
  closeSwitch: () => set({ switching: false }),
}))
