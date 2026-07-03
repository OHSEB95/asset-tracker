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

export function cashImpact(tx: Pick<Transaction, 'type' | 'amount' | 'quantity' | 'price'>): number {
  switch (tx.type) {
    case 'DEPOSIT':
    case 'DIVIDEND':
      return tx.amount!
    case 'WITHDRAWAL':
      return -tx.amount!
    case 'BUY':
      return -(tx.quantity! * tx.price!)
    case 'SELL':
      return tx.quantity! * tx.price!
    case 'ADJUST':
      return 0
    default:
      return 0
  }
}
