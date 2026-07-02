import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlySummaryRow } from '@shared/types'

function DividendsChart({ data }: { data: MonthlySummaryRow[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="yearMonth" />
        <YAxis tickFormatter={(v) => `${Math.round(v / 10000).toLocaleString()}만`} />
        <Tooltip formatter={(value) => `${Math.round(Number(value)).toLocaleString()}원`} />
        <Bar dataKey="dividends" name="배당" fill="var(--chart-dividend-fill, #16a34a)" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default DividendsChart
