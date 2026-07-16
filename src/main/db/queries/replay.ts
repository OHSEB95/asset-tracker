import type { Transaction } from '@shared/types'

export interface HoldingState {
  quantity: number
  avgCost: number | null
  /** 평단가를 매수 시점의 실제 환율로 환산한 원화 기준 평단가(해외주식). 원화 종목은 avgCost와 동일. */
  avgCostKrw: number | null
}

/**
 * transactions must be pre-filtered to one holding's BUY/SELL/ADJUST rows, ordered by date ASC, id ASC.
 * fallbackFxRate는 그 거래에 아직 fx_rate가 채워지지 않았을 때만 쓰인다(신규 도입 직후 소급 반영
 * 전 짧은 기간 한정) - 기본값 1이 아니라 호출부가 가진 "현재 환율"을 넘기면 그 기간에도 손익이
 * 단위가 안 맞는 값이 아니라 예전과 같은(오늘 환율 기준) 근사값으로 자연스럽게 나온다.
 */
export function replayHoldingState(transactions: Transaction[], fallbackFxRate = 1): HoldingState {
  let quantity = 0
  let avgCost: number | null = null
  let avgCostKrw: number | null = null

  for (const tx of transactions) {
    if (tx.type === 'BUY' || tx.type === 'ADJUST') {
      const buyQty = tx.quantity!
      const buyPrice = tx.price!
      const fx = tx.fxRate ?? fallbackFxRate
      const prevCost: number = avgCost ?? 0
      const prevCostKrw: number = avgCostKrw ?? 0
      avgCost = (quantity * prevCost + buyQty * buyPrice) / (quantity + buyQty)
      avgCostKrw = (quantity * prevCostKrw + buyQty * buyPrice * fx) / (quantity + buyQty)
      quantity += buyQty
    } else if (tx.type === 'SELL') {
      quantity -= tx.quantity!
      if (quantity < 0) quantity = 0
    }
  }

  return { quantity, avgCost, avgCostKrw }
}

export interface CashHoldingState {
  balance: number
}

/** transactions must be pre-filtered to one 안전자산 상품의 DEPOSIT/WITHDRAWAL/ADJUST/CLOSE rows, ordered by date ASC, id ASC. */
export function replayCashHoldingState(transactions: Transaction[]): CashHoldingState {
  let balance = 0
  for (const tx of transactions) {
    if (tx.type === 'DEPOSIT' || tx.type === 'ADJUST') {
      balance += tx.amount!
    } else if (tx.type === 'WITHDRAWAL' || tx.type === 'CLOSE') {
      balance -= tx.amount!
    }
  }
  return { balance }
}

export function cashImpact(
  tx: Pick<Transaction, 'type' | 'amount' | 'quantity' | 'price' | 'holdingId'>
): number {
  switch (tx.type) {
    case 'DEPOSIT':
      return tx.holdingId != null ? 0 : tx.amount!
    case 'DIVIDEND':
      return tx.amount!
    case 'WITHDRAWAL':
      return tx.holdingId != null ? 0 : -tx.amount!
    case 'BUY':
      return -(tx.quantity! * tx.price!)
    case 'SELL':
      return tx.quantity! * tx.price!
    case 'ADJUST':
      return tx.holdingId != null ? 0 : tx.amount!
    case 'CLOSE':
      return tx.holdingId != null ? 0 : -tx.amount!
    default:
      return 0
  }
}
