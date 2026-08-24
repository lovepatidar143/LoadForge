import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MetricsSnapshot } from '../types';

interface ConnectionsChartProps {
  data: MetricsSnapshot[];
}

export default function ConnectionsChart({ data }: ConnectionsChartProps) {
  const chartData = data.map(d => ({
    time: new Date(d.timestampMs).toLocaleTimeString([], { hour12: false }),
    connections: d.activeConnections
  }));

  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col">
      <h3 className="text-slate-300 font-medium mb-4">Active Connections</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Line type="monotone" dataKey="connections" name="Connections" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
