import { describe, it, expect } from 'vitest'
import { extractMessage } from './webhook-parse'

const J = '5585999998888@s.whatsapp.net'
const msg = (message: unknown, key: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  key: { remoteJid: J, fromMe: false, id: 'M1', ...key }, pushName: 'Maria', message, messageTimestamp: 1760378400, ...extra,
})

describe('extractMessage', () => {
  it('texto recebido: guarda corpo, nome do contato e horário', () => {
    const r = extractMessage(msg({ conversation: 'Olá, tudo bem?' }))
    expect(r).toMatchObject({ messageId: 'M1', jid: J, phoneKey: '8599998888', fromMe: false, kind: 'text', body: 'Olá, tudo bem?', pushName: 'Maria' })
    expect(r?.timestamp?.toISOString()).toBe('2025-10-13T18:00:00.000Z')
  })

  it('texto enviado pelo celular da clínica: fromMe e sem nome de contato (pushName seria o da clínica)', () => {
    const r = extractMessage(msg({ conversation: 'Bom dia!' }, { fromMe: true }))
    expect(r?.fromMe).toBe(true)
    expect(r?.pushName).toBeNull()
  })

  it.each([
    ['imageMessage', { imageMessage: { caption: 'Meu exame' } }, 'image', 'Meu exame'],
    ['imagem sem legenda', { imageMessage: {} }, 'image', ''],
    ['audioMessage', { audioMessage: { seconds: 5, ptt: true } }, 'audio', ''],
    ['videoMessage', { videoMessage: { caption: 'olha' } }, 'video', 'olha'],
    ['documentMessage', { documentMessage: { fileName: 'laudo.pdf' } }, 'document', ''],
    ['documento com legenda', { documentWithCaptionMessage: { message: { documentMessage: { caption: 'segue o laudo' } } } }, 'document', 'segue o laudo'],
    ['stickerMessage', { stickerMessage: {} }, 'sticker', ''],
    ['contato compartilhado', { contactMessage: { displayName: 'Ana' } }, 'other', ''],
    ['localização', { locationMessage: { degreesLatitude: 1 } }, 'other', ''],
  ])('%s → %s', (_n, message, kind, body) => {
    const r = extractMessage(msg(message))
    expect(r?.kind).toBe(kind)
    expect(r?.body).toBe(body)
  })

  it('texto aninhado em mensagem temporária e de visualização única', () => {
    expect(extractMessage(msg({ ephemeralMessage: { message: { extendedTextMessage: { text: 'oi' } } } }))?.body).toBe('oi')
    expect(extractMessage(msg({ viewOnceMessage: { message: { imageMessage: { caption: 'x' } } } }))?.kind).toBe('image')
  })

  it('descarta reação, ação interna, grupo, transmissão, status e mensagem vazia', () => {
    expect(extractMessage(msg({ reactionMessage: { text: '👍' } }))).toBeNull()
    expect(extractMessage(msg({ protocolMessage: { type: 0 } }))).toBeNull()
    expect(extractMessage(msg({ senderKeyDistributionMessage: {} }))).toBeNull()
    expect(extractMessage(msg({}))).toBeNull()
    expect(extractMessage(msg({ conversation: 'oi' }, { remoteJid: '120363025@g.us' }))).toBeNull()
    expect(extractMessage(msg({ conversation: 'oi' }, { remoteJid: 'status@broadcast' }))).toBeNull()
  })

  it('contato do exterior vira chave "raw:" (não se perde a mensagem)', () => {
    const r = extractMessage(msg({ conversation: 'hi' }, { remoteJid: '14155550123@s.whatsapp.net' }))
    expect(r?.phoneKey).toBe('raw:14155550123')
    expect(r?.jid).toBe('14155550123@s.whatsapp.net')
  })

  describe('@lid', () => {
    it('com telefone alternativo: usa o telefone para a chave e para responder', () => {
      const r = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid', remoteJidAlt: J }))
      expect(r?.phoneKey).toBe('8599998888')
      expect(r?.jid).toBe(J)
    })
    it('sem telefone: chave "lid:" e responde pelo @lid', () => {
      const r = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid' }))
      expect(r?.phoneKey).toBe('lid:9988776655')
      expect(r?.jid).toBe('9988776655@lid')
    })
    it('entrega o id do @lid, com ou sem telefone, para o servidor ligar os dois', () => {
      expect(extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid', remoteJidAlt: J }))?.lidId).toBe('9988776655')
      expect(extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid' }))?.lidId).toBe('9988776655')
      expect(extractMessage(msg({ conversation: 'oi' }))?.lidId).toBeNull()
    })
    it('telefone alternativo sem o 9 (conta antiga) gera a mesma chave', () => {
      const r = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid', remoteJidAlt: '558599998888@s.whatsapp.net' }))
      expect(r?.phoneKey).toBe('8599998888')
    })
    it('telefone alternativo de outro país: chave "raw:", nunca número brasileiro', () => {
      const r = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '9988776655@lid', remoteJidAlt: '34912345678@s.whatsapp.net' }))
      expect(r?.phoneKey).toBe('raw:34912345678')
      expect(r?.jid).toBe('34912345678@s.whatsapp.net')
    })
  })

  describe('telefone direto no jid', () => {
    it('com e sem o 9 convergem na mesma chave', () => {
      const a = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '5585999998888@s.whatsapp.net' }))
      const b = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '558599998888@s.whatsapp.net' }))
      expect(a?.phoneKey).toBe(b?.phoneKey)
    })
    it('número do exterior fica "raw:" e não colide com brasileiro do mesmo "DDD"', () => {
      const es = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '34912345678@s.whatsapp.net' }))
      const br = extractMessage(msg({ conversation: 'oi' }, { remoteJid: '5534912345678@s.whatsapp.net' }))
      expect(es?.phoneKey).toBe('raw:34912345678')
      expect(br?.phoneKey).toBe('3412345678')
    })
  })

  describe('horário', () => {
    it.each([
      [1760378400, '2025-10-13T18:00:00.000Z'],
      ['1760378400', '2025-10-13T18:00:00.000Z'],
      [{ low: 1760378400 }, '2025-10-13T18:00:00.000Z'],
      [1760378400000, '2025-10-13T18:00:00.000Z'],
    ])('%j', (ts, iso) => {
      expect(extractMessage(msg({ conversation: 'x' }, {}, { messageTimestamp: ts }))?.timestamp?.toISOString()).toBe(iso)
    })
    it('ausente ou inválido → null', () => {
      expect(extractMessage(msg({ conversation: 'x' }, {}, { messageTimestamp: undefined }))?.timestamp).toBeNull()
      expect(extractMessage(msg({ conversation: 'x' }, {}, { messageTimestamp: 'abc' }))?.timestamp).toBeNull()
    })
  })

  it('formato desconhecido não quebra', () => {
    expect(extractMessage(null)).toBeNull()
    expect(extractMessage('x')).toBeNull()
    expect(extractMessage({})).toBeNull()
    expect(extractMessage([])).toBeNull()
  })
})
