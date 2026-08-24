import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MetricsSnapshot } from '../types';

interface RpsChartProps {
  data: MetricsSnapshot[];
  targetRps?: number;
}

export default function RpsChart({ data, targetRps }: RpsChartProps) {
  const chartData = data.map(d => ({
    time: new Date(d.timestampMs).toLocaleTimeString([], { hour12: false }),
    rps: Math.round(d.currentRps),
    target: targetRps || 0
  }));

  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col">
      <h3 className="text-slate-300 font-medium mb-4">Requests per Second</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => val.toString()} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Line type="monotone" dataKey="rps" name="Actual RPS" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={false} />
            {targetRps && targetRps > 0 && (
              <Line type="stepAfter" dataKey="target" name="Target RPS" stroke="#94a3b8" strokeDasharray="5 5" dot={false} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
