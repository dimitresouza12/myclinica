import { describe, expect, it } from 'vitest'
import { firstAllowedRoute } from './homeRoute'

const view = (...mods: string[]) => Object.fromEntries(mods.map(m => [m, { can_view: true }]))

describe('firstAllowedRoute', () => {
  it('admin vai ao dashboard', () => {
    expect(firstAllowedRoute({}, { isAdmin: true })).toBe('/dashboard')
  })
  it('com dashboard liberado, fica no dashboard', () => {
    expect(firstAllowedRoute(view('dashboard', 'agenda'))).toBe('/dashboard')
  })
  it('recepção só com Agenda e Pacientes vai para a Agenda', () => {
    expect(firstAllowedRoute(view('agenda', 'pacientes'))).toBe('/agenda')
  })
  it('segue a ordem do menu', () => {
    expect(firstAllowedRoute(view('financeiro', 'pacientes'))).toBe('/pacientes')
  })
  it('ignora módulo com can_view falso', () => {
    expect(firstAllowedRoute({ dashboard: { can_view: false }, agenda: { can_view: true } })).toBe('/agenda')
  })
  it('Mensagens usa o módulo crm e vem antes do CRM', () => {
    expect(firstAllowedRoute(view('crm'))).toBe('/mensagens')
  })
  it('Campanhas só com plano plus', () => {
    expect(firstAllowedRoute(view('campanhas'))).toBe('/dashboard')
    expect(firstAllowedRoute(view('campanhas'), { isPlus: true })).toBe('/campanhas')
  })
  it('sem nenhum módulo cai no dashboard', () => {
    expect(firstAllowedRoute({})).toBe('/dashboard')
  })
})
