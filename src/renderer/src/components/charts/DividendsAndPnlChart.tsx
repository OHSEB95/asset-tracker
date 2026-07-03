import {
  CartesianGrid,
  ComposedChart,
  Legend,
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

function DividendsAndPnlChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`}
        />
        <Tooltip formatter={(value) => formatWon(value)} />
        <Legend />
        <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="dividends"
          name="배당"
          stroke="var(--chart-dividend-fill, #16a34a)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="right"
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

export default DividendsAndPnlChart
