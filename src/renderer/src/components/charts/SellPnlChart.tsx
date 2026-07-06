import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { MonthlySummaryRow } from '@shared/types'

function formatWon(value: unknown): string {
  return `${Math.round(Number(value)).toLocaleString()}원`
}

function formatMonthTick(yearMonth: string): string {
  return `${Number(yearMonth.slice(5, 7))}월`
}

function SellPnlChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} tickFormatter={formatMonthTick} interval={0} />
        <YAxis
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`}
        />
        <Tooltip formatter={(value) => formatWon(value)} wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Line
          type="monotone"
          dataKey="realizedPnl"
          name="매도손익"
          stroke="var(--chart-pnl-stroke, #d97706)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default SellPnlChart
