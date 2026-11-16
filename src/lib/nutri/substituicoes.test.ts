import { describe, expect, it } from 'vitest'
import { carregarTaco, catalogoCom } from './alimentos'
import {
  GRUPOS_PORCAO, equivalentesDoItem, grupoPorcaoDoAlimento, gramasParaEnergia, listaDoGrupo, medidaAproximada, textoPorcoes,
} from './substituicoes'

const TACO = await carregarTaco()
const porId = (id: string) => TACO.find(a => a.id === id)!

describe('base de porções equivalentes', () => {
  it('todo id existe na TACO e nenhum alimento está em dois grupos', () => {
    const todos = GRUPOS_PORCAO.flatMap(g => g.alimentoIds)
    expect(new Set(todos).size).toBe(todos.length)
    for (const id of todos) expect(porId(id), id).toBeDefined()
  })

  it('cada alimento fecha a porção com no máximo 8% de diferença de energia', () => {
    for (const g of GRUPOS_PORCAO) {
      for (const item of listaDoGrupo(g, TACO)) {
        const desvio = Math.abs(item.kcal - g.kcalPorcao) / g.kcalPorcao
        expect(desvio, `${g.id} / ${item.alimento.nome}: ${item.gramas} g = ${item.kcal} kcal`).toBeLessThanOrEqual(0.08)
        expect(item.gramas).toBeGreaterThan(0)
        expect(item.gramas % g.passoG).toBe(0)
      }
    }
  })

  it('o nome do alimento bate com o esperado (protege contra id trocado)', () => {
    expect(porId('taco-53').nome).toMatch(/francês/i)
    expect(porId('taco-488').nome).toMatch(/ovo.*inteiro.*cozido/i)
    expect(porId('taco-561').nome).toMatch(/feijão, carioca, cozido/i)
    expect(porId('taco-260').nome).toMatch(/azeite/i)
    expect(porId('taco-182').nome).toMatch(/banana, prata/i)
  })
})

describe('gramasParaEnergia', () => {
  it('arredonda ao passo e nunca devolve menos de um passo', () => {
    expect(gramasParaEnergia({ kcal: 300 }, 150, 5)).toBe(50)
    expect(gramasParaEnergia({ kcal: 884 }, 45, 1)).toBe(5)
    expect(gramasParaEnergia({ kcal: 884 }, 1, 5)).toBe(5)
  })
  it('energia inválida vira 0', () => {
    expect(gramasParaEnergia({ kcal: 0 }, 150, 5)).toBe(0)
    expect(gramasParaEnergia({ kcal: 100 }, 0, 5)).toBe(0)
  })
})

describe('equivalentesDoItem', () => {
  it('pão francês de 50 g (1 porção de cereais) rende as outras opções do grupo, sem o próprio pão', () => {
    const r = equivalentesDoItem(porId('taco-53'), 50, TACO)!
    expect(r.grupo.id).toBe('cereais')
    expect(r.porcoes).toBe(1)
    expect(r.kcalOriginal).toBe(150)
    expect(r.itens.length).toBe(GRUPOS_PORCAO[0].alimentoIds.length - 1)
    expect(r.itens.some(i => i.alimento.id === 'taco-53')).toBe(false)
    const arroz = r.itens.find(i => i.alimento.id === 'taco-3')!
    expect(arroz.gramas).toBe(115)
  })

  it('duas porções pedem o dobro de gramas', () => {
    const r = equivalentesDoItem(porId('taco-53'), 100, TACO)!
    expect(r.porcoes).toBe(2)
    expect(r.itens.find(i => i.alimento.id === 'taco-3')!.gramas).toBe(235)
  })

  it('ovo: sugere medida caseira quando a quantidade é próxima de meia em meia unidade', () => {
    const r = equivalentesDoItem(porId('taco-53'), 50, TACO)!
    expect(r.itens.every(i => i.medida === null || i.medida.startsWith('aprox. '))).toBe(true)
    const carnes = listaDoGrupo(GRUPOS_PORCAO.find(g => g.id === 'carnes')!, TACO, 1)
    const ovo = carnes.find(i => i.alimento.id === 'taco-488')!
    expect(ovo.gramas).toBe(70)
    expect(ovo.medida).toBe('aprox. 1,5 x ovo médio (unidade)')
  })

  it('alimento fora da lista curada ou sem energia: null (a tela cai nas trocas por energia)', () => {
    expect(equivalentesDoItem(porId('taco-2'), 100, TACO)).toBeNull()
    expect(equivalentesDoItem(porId('taco-53'), 0, TACO)).toBeNull()
    expect(grupoPorcaoDoAlimento('taco-2')).toBeNull()
    expect(grupoPorcaoDoAlimento('pers-xyz')).toBeNull()
  })

  it('ignora alimento que não está no catálogo informado', () => {
    const semArroz = TACO.filter(a => a.id !== 'taco-3')
    const r = equivalentesDoItem(porId('taco-53'), 50, semArroz)!
    expect(r.itens.some(i => i.alimento.id === 'taco-3')).toBe(false)
  })

  it('funciona com alimentos personalizados no catálogo sem quebrar', () => {
    const cat = catalogoCom([{ id: 'pers-1', nome: 'Meu pão', grupo: 'cereais', kcal: 250, proteina: 8, carboidrato: 45, lipidio: 3, fibra: 2 }], TACO)
    expect(equivalentesDoItem(cat.find(a => a.id === 'pers-1')!, 60, cat)).toBeNull()
  })
})

describe('medidaAproximada e textoPorcoes', () => {
  it('só para alimentos com unidade padronizada', () => {
    expect(medidaAproximada('taco-53', 50)).toBe('aprox. 1 x pão francês (unidade)')
    expect(medidaAproximada('taco-53', 100)).toBe('aprox. 2 x pão francês (unidade)')
    expect(medidaAproximada('taco-53', 60)).toBeNull()
    expect(medidaAproximada('taco-3', 100)).toBeNull()
    expect(medidaAproximada('taco-53', 0)).toBeNull()
  })
  it('singular e plural', () => {
    expect(textoPorcoes(1)).toBe('1 porção')
    expect(textoPorcoes(2)).toBe('2 porções')
    expect(textoPorcoes(1.5)).toBe('1,5 porções')
    expect(textoPorcoes(0.5)).toBe('0,5 porção')
  })
})
