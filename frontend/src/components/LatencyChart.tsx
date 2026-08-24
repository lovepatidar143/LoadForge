import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MetricsSnapshot } from '../types';
import { formatLatency } from '../utils/format';

interface LatencyChartProps {
  data: MetricsSnapshot[];
}

export default function LatencyChart({ data }: LatencyChartProps) {
  const chartData = data.map(d => ({
    time: new Date(d.timestampMs).toLocaleTimeString([], { hour12: false }),
    p50: d.latency.p50Ms,
    p95: d.latency.p95Ms,
    p99: d.latency.p99Ms
  }));

  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col">
      <h3 className="text-slate-300 font-medium mb-4">Latency Distribution</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val}ms`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
              formatter={(value: number) => [`${value.toFixed(2)} ms`]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="p50" name="P50" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p95" name="P95" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="p99" name="P99" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
