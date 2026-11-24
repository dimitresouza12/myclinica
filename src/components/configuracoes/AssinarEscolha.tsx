'use client'

import { useMemo, useState } from 'react'
import type { AuthClinic } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import { PUBLIC_PLANS, PLAN_CATALOG, isPublicPlan, type PublicPlan } from '@/lib/planCatalog'
import { formatBrl, formatDiaBr } from '@/lib/cartaoCheckout'
import { campanhaAtiva, firstDueDateFor } from '@/lib/campanha'
import { elegivelPromoPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { contractTotalCents, type ContractMonths, type ContractPaymentMode } from '@/lib/contratoPrecos'
import { suporteUrl } from '@/lib/suporte'
import { fluxoDaEscolha, opcoesDePrazo, parcelasPossiveis, resumoDaEscolha, type Prazo } from '@/lib/assinaturaEscolha'
import { ContratoFluxo } from './ContratoFluxo'
import styles from './AssinarEscolha.module.css'

interface Props {
  clinic: AuthClinic
  onClose: () => void
  /** Mensal sem fidelidade: abre o checkout de cartão já existente com o plano escolhido. */
  onCartao: (plano: PublicPlan) => void
  /** Contrato assinado: a aba Plano recarrega. */
  onContratoConcluido: () => void
}

export function AssinarEscolha({ clinic, onClose, onCartao, onContratoConcluido }: Props) {
  const [plan, setPlan] = useState<PublicPlan>(isPublicPlan(clinic.plan) ? clinic.plan : 'essencial')
  const [prazo, setPrazo] = useState<Prazo>(1)
  const [mode, setMode] = useState<ContractPaymentMode>('monthly')
  const [parcelas, setParcelas] = useState(1)
  const [etapa, setEtapa] = useState<'escolha' | 'contrato'>('escolha')

  const opcoes = useMemo(() => opcoesDePrazo(plan), [plan])
  const contrato = prazo !== 1
  const promoPrimeira = elegivelPromoPrimeiraCobranca(clinic.createdAt) && campanhaAtiva()
  const resumo = resumoDaEscolha({ plan, prazo, mode, installments: parcelas, promoPrimeira })
  const opcoesParcelas = contrato && mode === 'upfront' ? parcelasPossiveis(plan, prazo as ContractMonths) : [1]
  const primeira = formatDiaBr(firstDueDateFor(clinic.trialEndsAt))

  function escolherPrazo(p: Prazo) {
    setPrazo(p)
    if (p === 1) { setMode('monthly'); setParcelas(1) }
  }
  function escolherModo(m: ContractPaymentMode) { setMode(m); setParcelas(1) }

  function continuar() {
    if (fluxoDaEscolha(prazo) === 'cartao') onCartao(plan)
    else setEtapa('contrato')
  }

  if (etapa === 'contrato') {
    return (
      <Modal open onClose={onClose} title="Contrato" size="lg">
        <ContratoFluxo
          plan={plan} months={prazo as ContractMonths} paymentMode={mode} installments={parcelas}
          defaultPhone={clinic.billingPhone ?? ''}
          onVoltar={() => setEtapa('escolha')} onConcluido={onContratoConcluido}
        />
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Escolher plano e prazo" size="lg">
      <div className={styles.fluxo}>
        <fieldset className={styles.grupo}>
          <legend className={styles.legenda}>Plano</legend>
          <div className={styles.grade3} role="radiogroup" aria-label="Plano">
            {PUBLIC_PLANS.map(p => (
              <button key={p} type="button" role="radio" aria-checked={plan === p}
                className={`${styles.opcao} ${plan === p ? styles.opcaoOn : ''}`} onClick={() => setPlan(p)}>
                <span className={styles.opNome}>{PLAN_CATALOG[p].label}</span>
                <span className={styles.opSub}>{PLAN_CATALOG[p].price}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.grupo}>
          <legend className={styles.legenda}>Prazo</legend>
          <div className={styles.grade4} role="radiogroup" aria-label="Prazo">
            {opcoes.map(o => (
              <button key={o.prazo} type="button" role="radio" aria-checked={prazo === o.prazo}
                className={`${styles.opcao} ${prazo === o.prazo ? styles.opcaoOn : ''}`} onClick={() => escolherPrazo(o.prazo)}>
                <span className={styles.opNome}>{o.prazo === 1 ? 'Mensal' : o.rotulo}</span>
                <span className={styles.opPreco}>{formatBrl(o.valorMensal)}<small>/mês</small></span>
                <span className={styles.opSub}>
                  {o.prazo === 1 ? 'Sem fidelidade' : `${o.descontoMensalPct}% menos`}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {contrato && (
          <fieldset className={styles.grupo}>
            <legend className={styles.legenda}>Forma de pagamento</legend>
            <div className={styles.grade2} role="radiogroup" aria-label="Forma de pagamento">
              <button type="button" role="radio" aria-checked={mode === 'monthly'}
                className={`${styles.opcao} ${mode === 'monthly' ? styles.opcaoOn : ''}`} onClick={() => escolherModo('monthly')}>
                <span className={styles.opNome}>Mês a mês</span>
                <span className={styles.opSub}>{formatBrl(opcoes.find(o => o.prazo === prazo)!.valorMensal)} por mês</span>
                <span className={styles.opEco}>Economia de {formatBrl(opcoes.find(o => o.prazo === prazo)!.economiaMensal)}</span>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'upfront'}
                className={`${styles.opcao} ${mode === 'upfront' ? styles.opcaoOn : ''}`} onClick={() => escolherModo('upfront')}>
                <span className={styles.opNome}>À vista</span>
                <span className={styles.opSub}>{opcoes.find(o => o.prazo === prazo)!.descontoAvistaPct}% menos</span>
                <span className={styles.opEco}>Economia de {formatBrl(opcoes.find(o => o.prazo === prazo)!.economiaAvista)}</span>
              </button>
            </div>
            {mode === 'upfront' && (
              <div className={styles.parcelas}>
                <label className={styles.label} htmlFor="ae-parc">Parcelas no cartão</label>
                <select id="ae-parc" className={styles.input} value={parcelas} onChange={e => setParcelas(Number(e.target.value))}>
                  {opcoesParcelas.map(n => {
                    const r = resumoDaEscolha({ plan, prazo, mode, installments: n })
                    return <option key={n} value={n}>{n === 1 ? `1x de ${formatBrl(r.valorParcela)}, sem acréscimo` : `${n}x de ${formatBrl(r.valorParcela)}`}</option>
                  })}
                </select>
                {parcelas === 1 && <p className={styles.nota}>Pagando por Pix ou boleto o valor é o mesmo, sem acréscimo e com confirmação mais rápida.</p>}
                {parcelas > 1 && <p className={styles.nota}>No parcelamento, a taxa do cartão de {formatBrl(resumo.taxaCartao)} é somada ao valor do contrato.</p>}
              </div>
            )}
          </fieldset>
        )}

        <details className={styles.ajuda}>
          <summary className={styles.ajudaTitulo}>Como funcionam os prazos e descontos</summary>
          <div className={styles.ajudaCorpo}>
            <p><strong>Mensal, sem fidelidade.</strong> Você paga o valor de tabela ({formatBrl(opcoes[0].valorMensal)} no plano {PLAN_CATALOG[plan].label}), sem prazo mínimo, e cancela quando quiser.</p>
            <p><strong>Contrato de 3, 6 ou 12 meses.</strong> Você se compromete com o prazo e, em troca, a mensalidade fica mais barata durante todo o contrato. Quanto maior o prazo, maior o desconto.</p>
            <table className={styles.tabela}>
              <thead>
                <tr><th scope="col">Prazo</th><th scope="col">Mês a mês</th><th scope="col">À vista (pago de uma vez)</th></tr>
              </thead>
              <tbody>
                {opcoes.filter(o => o.prazo !== 1).map(o => (
                  <tr key={o.prazo}>
                    <th scope="row">{o.prazo} meses</th>
                    <td>{formatBrl(o.valorMensal)}/mês<small>{o.descontoMensalPct}% menos, economiza {formatBrl(o.economiaMensal)}</small></td>
                    <td>{formatBrl(contractTotalCents(plan, o.prazo as ContractMonths, 'upfront') / 100)} no total<small>{o.descontoAvistaPct}% menos, economiza {formatBrl(o.economiaAvista)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p><strong>Mês a mês.</strong> A mensalidade é cobrada todo mês, com o valor fixo do contrato.</p>
            <p><strong>À vista.</strong> Você paga o contrato inteiro de uma vez e ganha o desconto maior. Por Pix ou boleto o valor é o mesmo, sem acréscimo. No cartão em 1x também não há acréscimo; parcelando em mais vezes, a taxa do cartão é somada ao valor e aparece antes de você confirmar.</p>
            <p><strong>Quando começa a cobrança.</strong> O teste grátis continua até o fim dos 14 dias e nada é cobrado antes. A primeira cobrança é em {primeira}.</p>
            <p><strong>Black Friday.</strong> Quem se cadastrou de 23 a 30/11 paga 50% a menos na primeira mensalidade, nos pagamentos mês a mês. No à vista a promoção não se aplica, porque o desconto do contrato já é maior.</p>
            <p><strong>Depois do contrato.</strong> O uso continua no plano mensal, sem prazo mínimo e cancelável a qualquer momento, pelo valor de tabela vigente. Avisamos com 30 dias de antecedência.</p>
          </div>
        </details>

        <section className={styles.resumo} aria-live="polite">
          <h3 className={styles.h3}>Resumo</h3>
          {resumo.erro ? (
            <p className={styles.erro} role="alert"><Icon name="alert" size={13} /> {resumo.erro}</p>
          ) : (
            <dl className={styles.lista}>
              <div><dt>Plano</dt><dd>{PLAN_CATALOG[plan].label}</dd></div>
              <div><dt>Prazo</dt><dd>{prazo === 1 ? 'Mensal, sem fidelidade' : `${prazo} meses`}</dd></div>
              {!contrato || mode === 'monthly' ? (
                resumo.promo ? (
                  <>
                    <div><dt>1ª mensalidade (Black Friday, 50% off)</dt><dd>{formatBrl(resumo.primeiraMensalidade)}</dd></div>
                    <div><dt>Demais {prazo - 1} mensalidades</dt><dd>{formatBrl(resumo.valorMensal)}</dd></div>
                    <div><dt>Total do contrato</dt><dd>{formatBrl(resumo.total)}</dd></div>
                  </>
                ) : (
                  <div><dt>Mensalidade</dt><dd>{formatBrl(resumo.valorMensal)}</dd></div>
                )
              ) : (
                <div><dt>{parcelas > 1 ? 'Total no cartão' : 'Total à vista'}</dt><dd>{formatBrl(resumo.totalCobrado)}</dd></div>
              )}
              <div><dt>Primeira cobrança</dt><dd>{primeira}</dd></div>
              {resumo.economia > 0 && <div><dt>Você economiza</dt><dd>{formatBrl(resumo.economia)}</dd></div>}
            </dl>
          )}
        </section>

        <div className={styles.acoes}>
          <button type="button" className={btn.primary} onClick={continuar} disabled={!!resumo.erro}>
            {contrato ? 'Ler e assinar o contrato' : 'Cadastrar cartão e assinar'}
          </button>
          <a
            className={btn.secondary} target="_blank" rel="noopener noreferrer"
            href={suporteUrl(`Olá! Estou escolhendo o plano ${PLAN_CATALOG[plan].label} (${prazo === 1 ? 'mensal' : `${prazo} meses`}) no MyClinica e preciso de ajuda para entender os valores e descontos.`)}
          >
            Dúvidas? Falar com o suporte
          </a>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}
