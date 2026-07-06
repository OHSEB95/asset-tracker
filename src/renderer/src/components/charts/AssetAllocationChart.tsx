import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export interface AllocationSlice {
  name: string
  value: number
}

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3']

function formatWon(value: unknown): string {
  return `${Math.round(Number(value)).toLocaleString()}원`
}

function AssetAllocationChart({ data }: { data: AllocationSlice[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
          label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatWon(value)} wrapperStyle={{ fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export default AssetAllocationChart
