import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

function DividendChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} tickFormatter={formatMonthTick} interval={0} />
        <YAxis
          yAxisId="dividends"
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`}
        />
        <YAxis
          yAxisId="projected"
          orientation="right"
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`}
        />
        <Tooltip formatter={(value) => formatWon(value)} wrapperStyle={{ fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          yAxisId="dividends"
          type="monotone"
          dataKey="dividends"
          name="배당"
          stroke="var(--chart-dividend-fill, #16a34a)"
          strokeWidth={2}
          dot={{ r: 2 }}
        />
        <Line
          yAxisId="projected"
          type="monotone"
          dataKey="projectedDividends"
          name="예상 배당"
          stroke="var(--chart-dividend-projected-stroke, #2563eb)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 2 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default DividendChart
