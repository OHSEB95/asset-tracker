import type { Account, PriceFetchError, PriceFetchResult } from '@shared/types'

const CACHE_TTL_MS = 60_000
const priceCache = new Map<string, { result: PriceFetchResult; expiresAt: number }>()
let fxCache: { rate: number; expiresAt: number } | null = null

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

async function fetchUsdKrwRate(): Promise<number> {
  if (fxCache && fxCache.expiresAt > Date.now()) return fxCache.rate
  const data = await fetchJson('https://api.exchangerate-api.com/v4/latest/USD')
  const rate = data?.rates?.KRW
  if (typeof rate !== 'number') throw new Error('환율 정보를 찾을 수 없습니다')
  fxCache = { rate, expiresAt: Date.now() + CACHE_TTL_MS }
  return rate
}

async function fetchYahooForeignPrice(symbol: string): Promise<PriceFetchResult> {
  const data = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.trim())}`
  )
  const usdPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (typeof usdPrice !== 'number') throw new Error('가격 정보를 찾을 수 없습니다')
  const rate = await fetchUsdKrwRate()
  return {
    price: usdPrice * rate,
    currency: 'KRW',
    fetchedAt: new Date().toISOString(),
    source: 'yahoo'
  }
}

export async function fetchPriceForAccount(
  account: Account
): Promise<PriceFetchResult | PriceFetchError> {
  if (!account.symbol || !account.symbolSource) {
    return { error: '이 계좌에는 시세 조회용 심볼이 설정되어 있지 않습니다.' }
  }

  const key = cacheKey(account.symbolSource, account.symbol)
  const cached = priceCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  try {
    let result: PriceFetchResult
    switch (account.symbolSource) {
      case 'coingecko':
        result = await fetchCoingeckoPrice(account.symbol)
        break
      case 'naver':
        result = await fetchNaverDomesticPrice(account.symbol)
        break
      case 'yahoo':
        result = await fetchYahooForeignPrice(account.symbol)
        break
      default:
        return { error: `알 수 없는 시세 소스: ${account.symbolSource}` }
    }
    priceCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `시세 자동조회 실패 — 직접 입력해주세요 (${message})` }
  }
}
