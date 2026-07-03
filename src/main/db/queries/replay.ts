import type { Transaction } from '@shared/types'

export interface HoldingState {
  quantity: number
  avgCost: number | null
}

/** transactions must be pre-filtered to one holding's BUY/SELL/ADJUST rows, ordered by date ASC, id ASC. */
export function replayHoldingState(transactions: Transaction[]): HoldingState {
  let quantity = 0
  let avgCost: number | null = null

  for (const tx of transactions) {
    if (tx.type === 'BUY' || tx.type === 'ADJUST') {
      const buyQty = tx.quantity!
      const buyPrice = tx.price!
      const prevCost: number = avgCost ?? 0
      avgCost = (quantity * prevCost + buyQty * buyPrice) / (quantity + buyQty)
      quantity += buyQty
    } else if (tx.type === 'SELL') {
      quantity -= tx.quantity!
      if (quantity < 0) quantity = 0
    }
  }

  return { quantity, avgCost }
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
