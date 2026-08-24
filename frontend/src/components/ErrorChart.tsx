import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MetricsSnapshot } from '../types';

interface ErrorChartProps {
  data: MetricsSnapshot[];
}

export default function ErrorChart({ data }: ErrorChartProps) {
  const chartData = data.map(d => {
    const errorRate = d.totalRequests > 0 ? (d.failedRequests / d.totalRequests) * 100 : 0;
    return {
      time: new Date(d.timestampMs).toLocaleTimeString([], { hour12: false }),
      errorRate: parseFloat(errorRate.toFixed(2))
    };
  });

  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col">
      <h3 className="text-slate-300 font-medium mb-4">Error Rate (%)</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickMargin={10} minTickGap={30} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val}%`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
              formatter={(value: number) => [`${value}%`, 'Error Rate']}
            />
            <Area type="monotone" dataKey="errorRate" stroke="#EF4444" fillOpacity={1} fill="url(#colorError)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
