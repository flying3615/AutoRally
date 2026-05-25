import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface PieDatum {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: PieDatum[];
}

export function GameTypePie({ data }: Props) {
  if (data.length === 0) {
    return <div className="text-xs text-zinc-400 text-center py-8">No games played</div>;
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#71717a' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
