import { getDatabase } from '../index'
import type { Holding, HoldingInput, HoldingSnapshot, PriceSnapshotInput, Transaction } from '@shared/types'
import { replayCashHoldingState, replayHoldingState } from './replay'

function rowToHolding(row: any): Holding {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    priceSymbol: row.price_symbol,
    priceSource: row.price_source,
    isArchived: !!row.is_archived,
    dividendPerShare: row.dividend_per_share,
    dividendCycleType: row.dividend_cycle_type,
    dividendMonths: row.dividend_months
      ? row.dividend_months.split(',').map((m: string) => Number(m))
      : null,
    dividendExDay: row.dividend_ex_day,
    dividendPayDay: row.dividend_pay_day
  }
}

function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function listHoldingsForAccount(accountId: number, includeArchived = false): Holding[] {
  const db = getDatabase()
  const sql = includeArchived
    ? `SELECT * FROM holdings WHERE account_id = ? ORDER BY id`
    : `SELECT * FROM holdings WHERE account_id = ? AND is_archived = 0 ORDER BY id`
  const rows = db.prepare(sql).all(accountId)
  return rows.map(rowToHolding)
}

export function getHoldingById(id: number): Holding | null {
  const db = getDatabase()
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(id)
  return row ? rowToHolding(row) : null
}

export function createHolding(input: HoldingInput): Holding {
  const db = getDatabase()
  const result = db
    .prepare(
      `INSERT INTO holdings
         (account_id, name, price_symbol, price_source, dividend_per_share, dividend_cycle_type, dividend_months,
          dividend_ex_day, dividend_pay_day)
       VALUES (@accountId, @name, @priceSymbol, @priceSource, @dividendPerShare, @dividendCycleType, @dividendMonths,
               @dividendExDay, @dividendPayDay)`
    )
    .run({
      accountId: input.accountId,
      name: input.name,
      priceSymbol: input.priceSymbol ?? null,
      priceSource: input.priceSource ?? null,
      dividendPerShare: input.dividendPerShare ?? null,
      dividendCycleType: input.dividendCycleType ?? null,
      dividendMonths: input.dividendMonths?.length ? input.dividendMonths.join(',') : null,
      dividendExDay: input.dividendExDay ?? null,
      dividendPayDay: input.dividendPayDay ?? null
    })
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(result.lastInsertRowid)
  return rowToHolding(row)
}

export function updateHolding(id: number, input: HoldingInput): Holding {
  const db = getDatabase()
  db.prepare(
    `UPDATE holdings SET
       name = @name,
       price_symbol = @priceSymbol,
       price_source = @priceSource,
       dividend_per_share = @dividendPerShare,
       dividend_cycle_type = @dividendCycleType,
       dividend_months = @dividendMonths,
       dividend_ex_day = @dividendExDay,
       dividend_pay_day = @dividendPayDay
     WHERE id = @id`
  ).run({
    id,
    name: input.name,
    priceSymbol: input.priceSymbol ?? null,
    priceSource: input.priceSource ?? null,
    dividendPerShare: input.dividendPerShare ?? null,
    dividendCycleType: input.dividendCycleType ?? null,
    dividendMonths: input.dividendMonths?.length ? input.dividendMonths.join(',') : null,
    dividendExDay: input.dividendExDay ?? null,
    dividendPayDay: input.dividendPayDay ?? null
  })
  const row = db.prepare(`SELECT * FROM holdings WHERE id = ?`).get(id)
  return rowToHolding(row)
}

export function archiveHolding(id: number, archived: boolean): void {
  const db = getDatabase()
  db.prepare(`UPDATE holdings SET is_archived = ? WHERE id = ?`).run(archived ? 1 : 0, id)
}

/** 상품이 속한 계좌의 account_type_code를 조회한다 (안전자산 여부 판별용). */
export function getHoldingAccountTypeCode(holdingId: number): string | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT a.account_type_code AS code FROM holdings h
       JOIN accounts a ON a.id = h.account_id WHERE h.id = ?`
    )
    .get(holdingId) as { code: string } | undefined
  return row?.code ?? null
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    holdingId: row.holding_id,
    type: row.type,
    date: row.date,
    quantity: row.quantity,
    price: row.price,
    amount: row.amount,
    realizedPnl: row.realized_pnl,
    note: row.note,
    fxRate: row.fx_rate,
    realizedPnlKrw: row.realized_pnl_krw
  }
}

function getLatestSnapshot(
  holdingId: number,
  asOfYearMonth: string
): { price: number; yearMonth: string } | null {
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT price, year_month FROM price_snapshots
       WHERE holding_id = ? AND year_month <= ?
       ORDER BY year_month DESC LIMIT 1`
    )
    .get(holdingId, asOfYearMonth) as { price: number; year_month: string } | undefined
  return row ? { price: row.price, yearMonth: row.year_month } : null
}

export function getHoldingSnapshot(holdingId: number, fallbackFxRate = 1): HoldingSnapshot {
  const db = getDatabase()

  if (getHoldingAccountTypeCode(holdingId) === 'YOUTH_SAVINGS') {
    const rows = db
      .prepare(
        `SELECT * FROM transactions WHERE holding_id = ?
         AND type IN ('DEPOSIT','WITHDRAWAL','ADJUST','CLOSE') ORDER BY date ASC, id ASC`
      )
      .all(holdingId)
    const { balance } = replayCashHoldingState(rows.map(rowToTransaction))
    return {
      holdingId,
      quantity: null,
      avgCost: null,
      avgCostKrw: null,
      lastKnownPrice: null,
      lastKnownPriceMonth: null,
      currentValuation: balance
    }
  }

  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE holding_id = ? AND type IN ('BUY','SELL','ADJUST') ORDER BY date ASC, id ASC`
    )
    .all(holdingId)
  const state = replayHoldingState(rows.map(rowToTransaction), fallbackFxRate)

  const snapshot = getLatestSnapshot(holdingId, currentYearMonth())
  const priceForValuation = snapshot?.price ?? state.avgCost

  return {
    holdingId,
    quantity: state.quantity,
    avgCost: state.avgCost,
    avgCostKrw: state.avgCostKrw,
    lastKnownPrice: snapshot?.price ?? null,
    lastKnownPriceMonth: snapshot?.yearMonth ?? null,
    currentValuation: priceForValuation != null ? state.quantity * priceForValuation : null
  }
}

/**
 * 특정 날짜(주로 배당락일) 시점까지의 매수/매도/정리 거래만 반영한 보유수량.
 * 배당락일 이후에 이루어진 매수/정리는 그 달 배당에는 반영되지 않고 다음 배당락일부터 반영된다.
 */
export function getHoldingQuantityAsOf(holdingId: number, asOfDate: string): number {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE holding_id = ? AND type IN ('BUY','SELL','ADJUST') AND date <= ?
       ORDER BY date ASC, id ASC`
    )
    .all(holdingId, asOfDate)
  return replayHoldingState(rows.map(rowToTransaction)).quantity
}

/**
 * 평단가를 사용자가 지정한 값에 정확히 맞춘다 - 가장 최근 매수/정리(BUY/ADJUST) 거래의 단가를
 * 역산해서 조정하는 방식. 실제 체결가가 입력 과정에서 반올림되며 생기는 미세한 오차를 사용자가
 * 직접 바로잡을 수 있게 해줌. 가장 최근 거래가 매도(SELL)면 그 매도의 실현손익이 그 이전 매수
 * 단가에 의존하므로(역산 대상이 아니라서) 자동 조정을 지원하지 않는다.
 */
export function setHoldingAvgCost(holdingId: number, targetAvgCost: number): void {
  const db = getDatabase()
  if (!Number.isFinite(targetAvgCost) || targetAvgCost <= 0) {
    throw new Error('평단가는 0보다 큰 숫자여야 합니다.')
  }

  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE holding_id = ? AND type IN ('BUY','SELL','ADJUST') ORDER BY date ASC, id ASC`
    )
    .all(holdingId) as any[]
  const transactions = rows.map(rowToTransaction)

  const lastTx = transactions[transactions.length - 1]
  if (!lastTx || lastTx.type === 'SELL') {
    throw new Error(
      '가장 최근 거래가 매도라 평단가를 자동으로 맞출 수 없습니다. 최근 매수/정리 내역이 있어야 합니다.'
    )
  }

  const priorState = replayHoldingState(transactions.slice(0, -1))
  const lastQty = lastTx.quantity!
  const priorQty = priorState.quantity
  const priorAvgCost = priorState.avgCost ?? 0
  const finalQty = priorQty + lastQty

  const neededPrice = (targetAvgCost * finalQty - priorQty * priorAvgCost) / lastQty
  if (!Number.isFinite(neededPrice) || neededPrice <= 0) {
    throw new Error('가장 최근 매수 내역만 조정해서는 이 평단가를 만들 수 없습니다.')
  }

  db.prepare(`UPDATE transactions SET price = ? WHERE id = ?`).run(neededPrice, lastTx.id)
}

export function upsertPriceSnapshot(input: PriceSnapshotInput): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO price_snapshots (holding_id, year_month, price, source, updated_at)
     VALUES (@holdingId, @yearMonth, @price, @source, datetime('now'))
     ON CONFLICT(holding_id, year_month) DO UPDATE SET
       price = excluded.price,
       source = excluded.source,
       updated_at = datetime('now')`
  ).run({
    holdingId: input.holdingId,
    yearMonth: input.yearMonth,
    price: input.price,
    source: input.source ?? null
  })
}
