import type { Holding, PriceFetchError, PriceFetchResult } from '@shared/types'

const CACHE_TTL_MS = 60_000
const FALLBACK_USD_KRW_RATE = 1400
const priceCache = new Map<string, { result: PriceFetchResult; expiresAt: number }>()

interface RateState {
  rate: number
  fetchedAt: string
  expiresAt: number
}
let lastKnownRate: RateState | null = null

function cacheKey(source: string, symbol: string): string {
  return `${source}:${symbol}`
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchCoingeckoPrice(symbol: string): Promise<PriceFetchResult> {
  const id = symbol.trim().toLowerCase() === 'btc' ? 'bitcoin' : symbol.trim().toLowerCase()
  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=krw`
  )
  const price = data?.[id]?.krw
  if (typeof price !== 'number') throw new Error('가격 정보를 찾을 수 없습니다')
  return { price, currency: 'KRW', fetchedAt: new Date().toISOString(), source: 'coingecko' }
}

// 비공식 엔드포인트: 언제든 응답 형식이 바뀌거나 차단될 수 있음. 실패 시 상위에서 수동 입력으로 폴백.
async function fetchNaverDomesticPrice(symbol: string): Promise<PriceFetchResult> {
  const code = symbol.trim()
  const data = await fetchJson(`https://m.stock.naver.com/api/stock/${code}/basic`)
  const price = Number(data?.closePrice?.toString().replace(/,/g, ''))
  if (!price || Number.isNaN(price)) throw new Error('가격 정보를 찾을 수 없습니다')
  return { price, currency: 'KRW', fetchedAt: new Date().toISOString(), source: 'naver' }
}

async function fetchUsdKrwRateRaw(): Promise<number> {
  const data = await fetchJson('https://api.exchangerate-api.com/v4/latest/USD')
  const rate = data?.rates?.KRW
  if (typeof rate !== 'number') throw new Error('환율 정보를 찾을 수 없습니다')
  return rate
}

/** 절대 throw하지 않음 — 실패 시 마지막으로 성공한 환율, 그마저 없으면 고정값으로 대체. */
export async function getUsdKrwRate(): Promise<{ rate: number; fetchedAt: string; stale: boolean }> {
  if (lastKnownRate && lastKnownRate.expiresAt > Date.now()) {
    return { rate: lastKnownRate.rate, fetchedAt: lastKnownRate.fetchedAt, stale: false }
  }
  try {
    const rate = await fetchUsdKrwRateRaw()
    const fetchedAt = new Date().toISOString()
    lastKnownRate = { rate, fetchedAt, expiresAt: Date.now() + CACHE_TTL_MS }
    return { rate, fetchedAt, stale: false }
  } catch {
    if (lastKnownRate) {
      return { rate: lastKnownRate.rate, fetchedAt: lastKnownRate.fetchedAt, stale: true }
    }
    return { rate: FALLBACK_USD_KRW_RATE, fetchedAt: new Date().toISOString(), stale: true }
  }
}

async function fetchYahooForeignPrice(symbol: string): Promise<PriceFetchResult> {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.trim())}`
  )
  const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (typeof usdPrice !== 'number') throw new Error('가격 정보를 찾을 수 없습니다')
  return {
    price: usdPrice,
    currency: 'USD',
    fetchedAt: new Date().toISOString(),
    source: 'yahoo'
  }
}

export async function fetchPriceForHolding(
  holding: Holding
): Promise<PriceFetchResult | PriceFetchError> {
  if (!holding.priceSymbol || !holding.priceSource) {
    return { error: '이 보유종목에는 시세 조회용 심볼이 설정되어 있지 않습니다.' }
  }

  const key = cacheKey(holding.priceSource, holding.priceSymbol)
  const cached = priceCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  try {
    let result: PriceFetchResult
    switch (holding.priceSource) {
      case 'coingecko':
        result = await fetchCoingeckoPrice(holding.priceSymbol)
        break
      case 'naver':
        result = await fetchNaverDomesticPrice(holding.priceSymbol)
        break
      case 'yahoo':
        result = await fetchYahooForeignPrice(holding.priceSymbol)
        break
      default:
        return { error: `알 수 없는 시세 소스: ${holding.priceSource}` }
    }
    priceCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `시세 자동조회 실패 — 직접 입력해주세요 (${message})` }
  }
}
