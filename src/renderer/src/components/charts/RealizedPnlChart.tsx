import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlySummaryRow } from '@shared/types'

function RealizedPnlChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" />
        <YAxis tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`} />
        <Tooltip formatter={(value) => `${Math.round(Number(value)).toLocaleString()}원`} />
        <Bar dataKey="realizedPnl" name="매도손익">
          {data.map((row, idx) => (
            <Cell
              key={idx}
              fill={
                row.realizedPnl >= 0
                  ? 'var(--chart-gain-fill, #dc2626)'
                  : 'var(--chart-loss-fill, #2563eb)'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default RealizedPnlChart
