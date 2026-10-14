import { describe, it, expect } from 'vitest'
import { normalizeEvent, parseEnvelope, extractIncomingText, extractConnectionUpdate } from './webhook-parse'

const J = '5585999998888@s.whatsapp.net'

describe('normalizeEvent', () => {
  it.each([
    ['messages.upsert', 'messages.upsert'], ['MESSAGES_UPSERT', 'messages.upsert'],
    ['connection.update', 'connection.update'], ['CONNECTION_UPDATE', 'connection.update'],
    ['qrcode.updated', 'other'], ['', 'other'], [undefined, 'other'], [42, 'other'],
  ])('%s → %s', (raw, esperado) => expect(normalizeEvent(raw)).toBe(esperado))
})

describe('parseEnvelope', () => {
  it('lê evento, instância e dados', () => {
    const e = parseEnvelope({ event: 'messages.upsert', instance: 'mc_abc', data: { x: 1 } })
    expect(e).toEqual({ event: 'messages.upsert', instance: 'mc_abc', data: { x: 1 } })
  })
  it('corpo inválido não quebra', () => {
    expect(parseEnvelope(null).event).toBe('other')
    expect(parseEnvelope('texto').instance).toBeNull()
    expect(parseEnvelope(undefined).data).toBeUndefined()
  })
})

describe('extractIncomingText', () => {
  const msg = (over: Record<string, unknown> = {}) => ({
    key: { remoteJid: J, fromMe: false, id: 'ABC123' },
    pushName: 'Maria',
    message: { conversation: 'Sim' },
    messageType: 'conversation',
    ...over,
  })

  it('texto simples (conversation)', () => {
    const r = extractIncomingText(msg())
    expect(r).toEqual({ messageId: 'ABC123', jid: J, phoneKey: '8599998888', viaLid: false, text: 'Sim' })
  })

  it('texto em extendedTextMessage (resposta citando a mensagem)', () => {
    const r = extractIncomingText(msg({ message: { extendedTextMessage: { text: 'Confirmo!' } } }))
    expect(r?.text).toBe('Confirmo!')
  })

  it('texto dentro de mensagem temporária', () => {
    const r = extractIncomingText(msg({ message: { ephemeralMessage: { message: { conversation: 'ok' } } } }))
    expect(r?.text).toBe('ok')
  })

  it('data como lista usa o primeiro item', () => {
    expect(extractIncomingText([msg()])?.text).toBe('Sim')
  })

  it('mensagem enviada pela própria clínica é ignorada', () => {
    expect(extractIncomingText(msg({ key: { remoteJid: J, fromMe: true, id: 'X' } }))).toBeNull()
  })

  it('grupo, transmissão e status são ignorados', () => {
    for (const jid of ['120363025@g.us', 'status@broadcast', '5585@broadcast']) {
      expect(extractIncomingText(msg({ key: { remoteJid: jid, fromMe: false, id: 'X' } }))).toBeNull()
    }
  })

  it('áudio, imagem e figurinha (sem texto) são ignorados', () => {
    expect(extractIncomingText(msg({ message: { audioMessage: { seconds: 3 } }, messageType: 'audioMessage' }))).toBeNull()
    expect(extractIncomingText(msg({ message: { imageMessage: { caption: '' } } }))).toBeNull()
  })

  it('texto só com espaços é ignorado', () => {
    expect(extractIncomingText(msg({ message: { conversation: '   ' } }))).toBeNull()
  })

  it('formato desconhecido não quebra', () => {
    expect(extractIncomingText(null)).toBeNull()
    expect(extractIncomingText('x')).toBeNull()
    expect(extractIncomingText({})).toBeNull()
    expect(extractIncomingText({ key: {} })).toBeNull()
  })

  describe('identificador interno (@lid)', () => {
    it('com telefone em remoteJidAlt → acha a chave', () => {
      const r = extractIncomingText(msg({
        key: { remoteJid: '123456789012345@lid', remoteJidAlt: J, fromMe: false, id: 'L1' },
      }))
      expect(r?.viaLid).toBe(true)
      expect(r?.phoneKey).toBe('8599998888')
    })

    it('com telefone em senderPn só com dígitos', () => {
      const r = extractIncomingText(msg({
        key: { remoteJid: '123456789012345@lid', senderPn: '5585999998888', fromMe: false, id: 'L2' },
      }))
      expect(r?.phoneKey).toBe('8599998888')
    })

    it('sem telefone nenhum → phoneKey vazio (não dá para casar com a consulta)', () => {
      const r = extractIncomingText(msg({ key: { remoteJid: '123456789012345@lid', fromMe: false, id: 'L3' } }))
      expect(r?.viaLid).toBe(true)
      expect(r?.phoneKey).toBe('')
    })
  })
})

describe('extractConnectionUpdate', () => {
  it('lê o estado', () => {
    expect(extractConnectionUpdate({ instance: 'x', state: 'open' }).state).toBe('open')
    expect(extractConnectionUpdate([{ state: 'close' }]).state).toBe('close')
  })
  it('estado desconhecido → null', () => {
    expect(extractConnectionUpdate({ state: 'xyz' }).state).toBeNull()
    expect(extractConnectionUpdate(null).state).toBeNull()
  })
})
