import { describe, it, expect } from 'vitest'
import {
  formatBrPhone, maskBrPhone, isCompleteBrPhone, phoneInputError, caretAfterDigits, toInputValue,
  previousPhoneNote, waMeNumber, formatNational, PHONE_INCOMPLETE,
} from './phoneFormat'

/** Simula uma pessoa digitando tecla por tecla: cada tecla entra no que já está no campo e o campo aplica a máscara. */
function typeKeys(keys: string): string {
  let value = ''
  for (const ch of keys) value = maskBrPhone(value + ch)
  return value
}

describe('formatBrPhone (exibição)', () => {
  it.each([
    ['85999998888', '(85) 99999-8888'],
    ['(85) 99999-8888', '(85) 99999-8888'],
    ['5585999998888', '(85) 99999-8888'],
    ['+55 85 99999-8888', '(85) 99999-8888'],
    ['558599998888', '(85) 99999-8888'],          // conta antiga, sem o 9 → ganha o 9
    ['(85) 9999-8888', '(85) 99999-8888'],
    ['085 99999-8888', '(85) 99999-8888'],
    ['5585999998888@s.whatsapp.net', '(85) 99999-8888'],
    ['8532221111', '(85) 3222-1111'],
    ['(85) 3222-1111', '(85) 3222-1111'],
    ['55999887766', '(55) 99988-7766'],            // DDD 55 não é o código do país
    ['5555999887766', '(55) 99988-7766'],
  ])('%s → %s', (raw, esperado) => {
    expect(formatBrPhone(raw)).toBe(esperado)
  })

  it('dois números no campo aparecem os dois, no mesmo formato', () => {
    expect(formatBrPhone('85999998888 / 8532221111')).toBe('(85) 99999-8888 / (85) 3222-1111')
  })
  it('vazio dá vazio; o que não é telefone brasileiro aparece como está', () => {
    expect(formatBrPhone('')).toBe('')
    expect(formatBrPhone(null)).toBe('')
    expect(formatBrPhone('   ')).toBe('')
    expect(formatBrPhone('99999-8888')).toBe('99999-8888') // sem DDD: não dá para formatar sem inventar
    expect(formatBrPhone('sem telefone')).toBe('sem telefone')
  })
})

describe('maskBrPhone (digitação)', () => {
  it('celular, tecla por tecla', () => {
    const steps = ['(8', '(85', '(85) 9', '(85) 99', '(85) 999', '(85) 9999', '(85) 99999', '(85) 99999-8', '(85) 99999-88', '(85) 99999-888', '(85) 99999-8888']
    let value = ''
    '85999998888'.split('').forEach((ch, i) => { value = maskBrPhone(value + ch); expect(value).toBe(steps[i]) })
  })

  it('fixo, tecla por tecla', () => {
    expect(typeKeys('8532221111')).toBe('(85) 3222-1111')
    expect(typeKeys('853222')).toBe('(85) 3222')
    expect(typeKeys('8532221')).toBe('(85) 3222-1')
  })

  it('não passa de 11 dígitos no celular nem de 10 no fixo', () => {
    expect(typeKeys('859999988889999')).toBe('(85) 99999-8888')
    expect(typeKeys('853222111199')).toBe('(85) 3222-1111')
  })

  it('descarta letras e símbolos', () => {
    expect(typeKeys('8a5b9-9.9x9 9 8888')).toBe('(85) 99999-8888')
  })

  it('recusa DDD impossível', () => {
    expect(typeKeys('0')).toBe('')                    // zero na frente some
    expect(typeKeys('10')).toBe('(1')                 // DDD 10 não existe: o 0 não entra
    expect(typeKeys('99999')).toBe('(99) 999')        // 99 é DDD válido
  })

  it('recusa o terceiro dígito que não é 9 (celular) nem 2 a 5 (fixo)', () => {
    expect(typeKeys('856')).toBe('(85')
    expect(typeKeys('857')).toBe('(85')
    expect(typeKeys('858')).toBe('(85')
    expect(typeKeys('850')).toBe('(85')
    expect(typeKeys('851')).toBe('(85')
    expect(typeKeys('859')).toBe('(85) 9')
    expect(typeKeys('852')).toBe('(85) 2')
    expect(typeKeys('855')).toBe('(85) 5')
  })

  it('apagar volta passo a passo', () => {
    expect(maskBrPhone('(85) 99999-888')).toBe('(85) 99999-888')
    expect(maskBrPhone('(85) 9')).toBe('(85) 9')
    expect(maskBrPhone('(85) ')).toBe('(85')
    expect(maskBrPhone('(8')).toBe('(8')
    expect(maskBrPhone('(')).toBe('')
    expect(maskBrPhone('')).toBe('')
  })

  describe('colar', () => {
    it.each([
      ['+55 85 99999-8888', '(85) 99999-8888'],
      ['5585999998888', '(85) 99999-8888'],
      ['(85) 3222-1111', '(85) 3222-1111'],
      ['+55 85 3222-1111', '(85) 3222-1111'],
      ['85999998888 / 85988887777', '(85) 99999-8888'], // dois números: fica o primeiro
      ['  85 99999 8888  ', '(85) 99999-8888'],
    ])('%s', (pasted, esperado) => {
      expect(maskBrPhone(pasted)).toBe(esperado)
    })

    it('número antigo sem o 9 NÃO ganha um 9 escondido: fica incompleto e o erro avisa', () => {
      // "85 9999-8888" (10 dígitos). Se a pessoa só esqueceu um dígito, inventar o 9 gravaria um número errado.
      for (const pasted of ['558599998888', '8599998888', '(85) 9999-8888']) {
        expect(maskBrPhone(pasted)).toBe('(85) 99998-888')
        expect(isCompleteBrPhone(pasted)).toBe(false)
        expect(phoneInputError(pasted)).toBe(PHONE_INCOMPLETE)
      }
    })

    it('DDD 55 colado como DDD, e com o código do país na frente', () => {
      expect(maskBrPhone('55999887766')).toBe('(55) 99988-7766')
      expect(maskBrPhone('5555999887766')).toBe('(55) 99988-7766')
    })
  })

  it('é idempotente: aplicar a máscara de novo não muda nada', () => {
    const samples = ['', '8', '85', '859', '85999998888', '(85) 99999-8888', '+55 (85) 3222-1111', 'abc', '0 85 9', '5585999998888', '999999999999999']
    for (const s of samples) expect(maskBrPhone(maskBrPhone(s))).toBe(maskBrPhone(s))
  })

  it('o que a máscara completa sempre é um telefone válido; o que sobra incompleto nunca é', () => {
    expect(isCompleteBrPhone(typeKeys('85999998888'))).toBe(true)
    expect(isCompleteBrPhone(typeKeys('8532221111'))).toBe(true)
    for (const partial of ['', '8', '85', '859', '8599999888', '853222111', '(85) 99999-888']) {
      expect(isCompleteBrPhone(partial)).toBe(false)
    }
  })
})

describe('validação do campo', () => {
  it('vazio vale quando o campo é opcional', () => {
    expect(phoneInputError('')).toBeNull()
    expect(phoneInputError('   ')).toBeNull()
    expect(phoneInputError('', { required: true })).toBe('Informe o telefone.')
  })
  it('preenchido precisa estar completo', () => {
    expect(phoneInputError('(85) 99999-8888')).toBeNull()
    expect(phoneInputError('(85) 3222-1111')).toBeNull()
    expect(phoneInputError('(85) 99999-888')).toBe(PHONE_INCOMPLETE)
    expect(phoneInputError('(85) 9')).toBe(PHONE_INCOMPLETE)
  })
})

describe('cursor', () => {
  it('fica depois do n-ésimo dígito', () => {
    expect(caretAfterDigits('(85) 99999-8888', 0)).toBe(0)
    expect(caretAfterDigits('(85) 99999-8888', 2)).toBe(3)
    expect(caretAfterDigits('(85) 99999-8888', 3)).toBe(6)
    expect(caretAfterDigits('(85) 99999-8888', 7)).toBe(10)
    expect(caretAfterDigits('(85) 99999-8888', 11)).toBe(15)
    expect(caretAfterDigits('(85', 99)).toBe(3)
  })
})

describe('cadastros antigos', () => {
  it('toInputValue entrega o primeiro número válido já formatado', () => {
    expect(toInputValue('5585999998888')).toBe('(85) 99999-8888')
    expect(toInputValue('85999998888 / 8532221111')).toBe('(85) 99999-8888')
    expect(toInputValue('99999-8888')).toBe('')   // sem DDD: o campo começa vazio, não inventa um DDD
    expect(toInputValue(null)).toBe('')
  })
  it('avisa quando o que está guardado tem mais do que o campo mostra', () => {
    expect(previousPhoneNote('(85) 99999-8888')).toBeNull()
    expect(previousPhoneNote('5585999998888')).toBeNull()
    expect(previousPhoneNote('085 99999-8888')).toBeNull()
    // conta antiga sem o 9: o campo mostra o número com o 9, e a tela avisa que o valor guardado era outro
    expect(previousPhoneNote('558599998888')).toBe('558599998888')
    expect(previousPhoneNote('')).toBeNull()
    expect(previousPhoneNote('99999-8888')).toBe('99999-8888')    // sem DDD
    expect(previousPhoneNote('85999998888 / 8532221111')).toBe('85999998888 / 8532221111')
  })
  it('link do WhatsApp com 55 uma vez só, preferindo o celular', () => {
    expect(waMeNumber('(85) 99999-8888')).toBe('5585999998888')
    expect(waMeNumber('5585999998888')).toBe('5585999998888')
    expect(waMeNumber('8532221111 / 85999998888')).toBe('5585999998888')
    expect(waMeNumber('99999-8888')).toBe('')
    expect(waMeNumber('')).toBe('')
  })
  it('formatNational', () => {
    expect(formatNational('85999998888')).toBe('(85) 99999-8888')
    expect(formatNational('8532221111')).toBe('(85) 3222-1111')
  })
})
