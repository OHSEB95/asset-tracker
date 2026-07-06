import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export interface AllocationSlice {
  name: string
  value: number
}

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#c026d3']

const RADIAN = Math.PI / 180

interface PieLabelProps {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

function formatWon(value: unknown): string {
  return `${Math.round(Number(value)).toLocaleString()}원`
}

// 라벨을 파이 바깥쪽이 아니라 도넛 링 안쪽에 그려서, 좁은 영역에서도 잘리지 않게 한다.
function renderInsideLabel({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent }: PieLabelProps): React.JSX.Element {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {`${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  )
}

function AssetAllocationChart({ data }: { data: AllocationSlice[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
          label={renderInsideLabel}
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
