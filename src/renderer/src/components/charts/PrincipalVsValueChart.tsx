import {
  Area,
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

function PrincipalVsValueChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" />
        <YAxis tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`} />
        <Tooltip formatter={(value) => formatWon(value)} />
        <Legend />
        <Area
          type="monotone"
          dataKey="cumulativeContribution"
          name="누적 원금"
          fill="var(--chart-principal-fill, #cbd5e1)"
          stroke="var(--chart-principal-stroke, #64748b)"
        />
        <Line
          type="monotone"
          dataKey="valuation"
          name="총 평가자산"
          stroke="var(--chart-value-stroke, #2563eb)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default PrincipalVsValueChart
