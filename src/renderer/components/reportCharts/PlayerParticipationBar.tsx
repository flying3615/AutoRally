import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, LabelList,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface ParticipationDatum {
  name: string;
  mixed: number;
  doubles: number;
  satOut: number;
  pct: number;
}

interface Props {
  data: ParticipationDatum[];
}

// Render the participation % at the far right of each bar row
function PctLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (value == null) return null;
  const color = value >= 80 ? '#059669' : value >= 50 ? '#d97706' : '#dc2626';
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dy="0.35em"
      fontSize={11}
      fontFamily="DM Mono, monospace"
      fill={color}
      fontWeight={600}
    >
      {value}%
    </text>
  );
}

export function PlayerParticipationBar({ data }: Props) {
  if (data.length === 0) {
    return <div className="text-xs text-zinc-400 text-center py-8">No data</div>;
  }

  const height = Math.max(48 * data.length, 200);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 52, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#f4f4f5" strokeDasharray="0" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#52525b', fontWeight: 500 }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: '#f4f4f5' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#71717a' }} />

          {/* Mixed games — purple */}
          <Bar dataKey="mixed" name="Mixed" stackId="a" fill="#7c3aed" radius={[0, 0, 0, 0]}>
            <LabelList dataKey="mixed" position="insideRight" style={{ fontSize: 10, fill: '#fff', fontWeight: 600 }}
              formatter={(v: unknown) => (v as number) > 0 ? String(v) : ''} />
          </Bar>

          {/* Doubles games — emerald */}
          <Bar dataKey="doubles" name="Doubles" stackId="a" fill="#059669" radius={[0, 0, 0, 0]}>
            <LabelList dataKey="doubles" position="insideRight" style={{ fontSize: 10, fill: '#fff', fontWeight: 600 }}
              formatter={(v: unknown) => (v as number) > 0 ? String(v) : ''} />
          </Bar>

          {/* Sat out — zinc */}
          <Bar dataKey="satOut" name="Sat Out" stackId="a" fill="#e4e4e7" radius={[0, 4, 4, 0]}>
            {/* Invisible sentinel bar: attach the pct label here so it always renders at the row's right edge */}
            <LabelList dataKey="pct" content={<PctLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
