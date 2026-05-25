import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface RoundDatum {
  round: string;
  count: number;
}

interface Props {
  data: RoundDatum[];
}

export function GamesPerRoundBar({ data }: Props) {
  if (data.length === 0) {
    return <div className="text-xs text-zinc-400 text-center py-8">No data</div>;
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#f4f4f5" strokeDasharray="0" />
          <XAxis
            dataKey="round"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            allowDecimals={false}
            width={24}
          />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v} game${v !== 1 ? 's' : ''}`} />}
            cursor={{ fill: '#f4f4f5' }}
          />
          <Bar dataKey="count" name="Games" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
