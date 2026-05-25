import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface LevelDatum {
  level: number;
  count: number;
  color: string;
}

interface Props {
  data: LevelDatum[];
}

export function LevelDistributionBar({ data }: Props) {
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#f4f4f5" strokeDasharray="0" />
          <XAxis
            dataKey="level"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            tickFormatter={v => `Lv ${v}`}
          />
          <YAxis hide allowDecimals={false} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v} player${v !== 1 ? 's' : ''}`} />}
            cursor={{ fill: '#f4f4f5' }}
          />
          <Bar dataKey="count" name="Players" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
