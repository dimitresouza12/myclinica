import { describe, it, expect } from 'vitest'
import {
  extractMessageEvent, extractStatusUpdate, upgradeStatus, applyReaction, canEditMessage, canDeleteForEveryone,
} from './message-events'
import { fillQuickReply, filterQuickReplies, slashQuery, validateQuickReply, firstName } from './quick-replies'
import { extractMessage, normalizeEvent } from './webhook-parse'

const key = { remoteJid: '5585999998888@s.whatsapp.net', fromMe: false, id: 'R1' }

describe('extractMessageEvent', () => {
  it('reação do contato e da clínica', () => {
    expect(extractMessageEvent({ key, message: { reactionMessage: { key: { id: 'M1' }, text: '👍' } } })).toEqual({ type: 'reaction', targetId: 'M1', emoji: '👍', fromMe: false })
    expect(extractMessageEvent({ key: { ...key, fromMe: true }, message: { reactionMessage: { key: { id: 'M1' }, text: '' } } })).toEqual({ type: 'reaction', targetId: 'M1', emoji: '', fromMe: true })
  })
  it('apagada para todos', () => {
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M2' }, type: 0 } } })).toEqual({ type: 'revoke', targetId: 'M2' })
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M2' }, type: 'REVOKE' } } })).toEqual({ type: 'revoke', targetId: 'M2' })
  })
  it('editada', () => {
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M3' }, type: 14, editedMessage: { conversation: ' novo texto ' } } } })).toEqual({ type: 'edit', targetId: 'M3', text: 'novo texto' })
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M3' }, type: 'MESSAGE_EDIT', editedMessage: { extendedTextMessage: { text: 'x' } } } } })).toMatchObject({ type: 'edit', text: 'x' })
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M3' }, type: 14, editedMessage: {} } } })).toBeNull()
  })
  it('o resto não é evento', () => {
    expect(extractMessageEvent({ key, message: { conversation: 'oi' } })).toBeNull()
    expect(extractMessageEvent(null)).toBeNull()
    expect(extractMessageEvent({ key, message: { reactionMessage: { text: '👍' } } })).toBeNull()
    expect(extractMessageEvent({ key, message: { protocolMessage: { key: { id: 'M' }, type: 3 } } })).toBeNull()
  })
  it('reação, apagar e editar não viram mensagem de conversa', () => {
    expect(extractMessage({ key, message: { reactionMessage: { key: { id: 'M1' }, text: '👍' } } })).toBeNull()
    expect(extractMessage({ key, message: { protocolMessage: { key: { id: 'M2' }, type: 0 } } })).toBeNull()
  })
})

describe('status', () => {
  it('lê o evento messages.update', () => {
    expect(normalizeEvent('MESSAGES_UPDATE')).toBe('messages.update')
    expect(extractStatusUpdate({ keyId: 'A', remoteJid: 'x', fromMe: true, status: 'READ' })).toEqual({ messageId: 'A', status: 'read' })
    expect(extractStatusUpdate([{ keyId: 'A', fromMe: true, status: 'DELIVERY_ACK' }])).toEqual({ messageId: 'A', status: 'delivered' })
    expect(extractStatusUpdate({ key: { id: 'A', fromMe: true }, status: 'SERVER_ACK' })).toEqual({ messageId: 'A', status: 'sent' })
    expect(extractStatusUpdate({ keyId: 'A', fromMe: true, status: 'PLAYED' })).toEqual({ messageId: 'A', status: 'read' })
  })
  it('ignora mensagem recebida e status desconhecido', () => {
    expect(extractStatusUpdate({ keyId: 'A', fromMe: false, status: 'READ' })).toBeNull()
    expect(extractStatusUpdate({ keyId: 'A', fromMe: true, status: 'PENDING' })).toBeNull()
    expect(extractStatusUpdate({ fromMe: true, status: 'READ' })).toBeNull()
    expect(extractStatusUpdate(null)).toBeNull()
  })
  it('só avança', () => {
    expect(upgradeStatus(null, 'sent')).toBe('sent')
    expect(upgradeStatus('sent', 'delivered')).toBe('delivered')
    expect(upgradeStatus('read', 'delivered')).toBe('read')
    expect(upgradeStatus('delivered', 'delivered')).toBe('delivered')
  })
})

describe('reações e prazos', () => {
  it('uma reação por pessoa; vazio remove', () => {
    expect(applyReaction({}, 'contato', '👍')).toEqual({ contato: '👍' })
    expect(applyReaction({ contato: '👍' }, 'contato', '❤')).toEqual({ contato: '❤' })
    expect(applyReaction({ contato: '👍', clinica: '❤' }, 'contato', '')).toEqual({ clinica: '❤' })
    expect(applyReaction(null, 'clinica', '👍')).toEqual({ clinica: '👍' })
  })
  const now = new Date('2026-10-14T12:00:00Z')
  const msg = (minutesAgo: number, extra = {}) => ({ kind: 'text', direction: 'out', created_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(), ...extra })
  it('editar: só texto enviado nos últimos 15 minutos', () => {
    expect(canEditMessage(msg(14), now)).toBe(true)
    expect(canEditMessage(msg(16), now)).toBe(false)
    expect(canEditMessage(msg(1, { kind: 'image' }), now)).toBe(false)
    expect(canEditMessage(msg(1, { direction: 'in' }), now)).toBe(false)
    expect(canEditMessage(msg(1, { deleted_at: now.toISOString() }), now)).toBe(false)
  })
  it('apagar para todos: enviada nos últimos 2 dias', () => {
    expect(canDeleteForEveryone(msg(47 * 60), now)).toBe(true)
    expect(canDeleteForEveryone(msg(49 * 60), now)).toBe(false)
    expect(canDeleteForEveryone(msg(1, { direction: 'in' }), now)).toBe(false)
    expect(canDeleteForEveryone(msg(1, { deleted_at: now.toISOString() }), now)).toBe(false)
  })
})

describe('respostas rápidas', () => {
  const list = [
    { id: '1', title: 'Endereço', body: 'Rua A, 10' },
    { id: '2', title: 'Valores', body: 'A consulta custa R$ 200 no endereço da clínica' },
    { id: '3', title: 'Saudação', body: 'Olá {nome}, tudo bem?' },
  ]
  it('{nome} vira o primeiro nome; sem nome, some junto com o espaço', () => {
    expect(fillQuickReply('Olá {nome}, tudo bem?', 'Ana Paula Souza')).toBe('Olá Ana, tudo bem?')
    expect(fillQuickReply('Olá {nome}, tudo bem?', null)).toBe('Olá, tudo bem?')
    expect(fillQuickReply('Olá {nome}, tudo bem?', '(85) 98888-7701')).toBe('Olá, tudo bem?')
    expect(fillQuickReply('{NOME}, oi', 'Ana')).toBe('Ana, oi')
    expect(fillQuickReply('sem variável', 'Ana')).toBe('sem variável')
  })
  it('primeiro nome', () => {
    expect(firstName('  joão da Silva')).toBe('joão')
    expect(firstName('')).toBeNull()
    expect(firstName('85 9999')).toBeNull()
  })
  it('filtro: título antes do texto, sem acento', () => {
    expect(filterQuickReplies(list, '').map(r => r.id)).toEqual(['1', '2', '3'])
    expect(filterQuickReplies(list, 'ender').map(r => r.id)).toEqual(['1', '2'])
    expect(filterQuickReplies(list, 'saudacao').map(r => r.id)).toEqual(['3'])
    expect(filterQuickReplies(list, 'zzz')).toEqual([])
  })
  it('comando com barra', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/val')).toBe('val')
    expect(slashQuery('/val ue')).toBeNull()
    expect(slashQuery('oi /val')).toBeNull()
    expect(slashQuery('//')).toBeNull()
  })
  it('validação', () => {
    expect(validateQuickReply({ title: ' ', body: 'x' })).toMatch(/nome/)
    expect(validateQuickReply({ title: 'a'.repeat(41), body: 'x' })).toMatch(/40/)
    expect(validateQuickReply({ title: 'a', body: ' ' })).toMatch(/texto/)
    expect(validateQuickReply({ title: 'a', body: 'x'.repeat(1001) })).toMatch(/1000/)
    expect(validateQuickReply({ title: 'a', body: 'x' })).toBeNull()
  })
})
