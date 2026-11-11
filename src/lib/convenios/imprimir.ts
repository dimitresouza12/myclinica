// Impressão no navegador das guias TISS e do recibo (mesma janela de impressão do restante do app, lib/print.ts).
'use client'
import { openPrint } from '@/lib/print'
import { guiaParaHtml, montarGuia, type GuiaContexto, type GuiaTipo } from './tiss'
import { montarRecibo, reciboParaHtml, type ReciboEntrada } from './recibo'

const agora = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function imprimirGuia(tipo: GuiaTipo, ctx: GuiaContexto) {
  return openPrint(guiaParaHtml(montarGuia(tipo, ctx), ctx.clinic.name, agora()))
}

export function imprimirReciboReembolso(entrada: ReciboEntrada) {
  return openPrint(reciboParaHtml(montarRecibo(entrada), entrada.clinic, agora()))
}
