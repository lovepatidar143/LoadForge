import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MetricsSnapshot } from '../types';

interface StatusCodeChartProps {
  metrics: MetricsSnapshot | null;
}

export default function StatusCodeChart({ metrics }: StatusCodeChartProps) {
  if (!metrics || !metrics.statusCodes || Object.keys(metrics.statusCodes).length === 0) {
    return (
      <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col items-center justify-center">
        <h3 className="text-slate-300 font-medium absolute top-4 left-4">Status Codes</h3>
        <p className="text-slate-500 text-sm">No data yet</p>
      </div>
    );
  }

  const codeGroups = {
    '2xx (Success)': 0,
    '3xx (Redirect)': 0,
    '4xx (Client Err)': 0,
    '5xx (Server Err)': 0,
    'Other': 0
  };

  Object.entries(metrics.statusCodes).forEach(([codeStr, count]) => {
    const code = parseInt(codeStr, 10);
    if (code >= 200 && code < 300) codeGroups['2xx (Success)'] += count;
    else if (code >= 300 && code < 400) codeGroups['3xx (Redirect)'] += count;
    else if (code >= 400 && code < 500) codeGroups['4xx (Client Err)'] += count;
    else if (code >= 500 && code < 600) codeGroups['5xx (Server Err)'] += count;
    else codeGroups['Other'] += count;
  });

  const data = Object.entries(codeGroups)
    .filter(([_, count]) => count > 0)
    .map(([name, value]) => ({ name, value }));

  const COLORS = {
    '2xx (Success)': '#10B981', // green
    '3xx (Redirect)': '#3B82F6', // blue
    '4xx (Client Err)': '#F59E0B', // amber
    '5xx (Server Err)': '#EF4444', // red
    'Other': '#94A3B8' // slate
  };

  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 h-80 flex flex-col">
      <h3 className="text-slate-300 font-medium mb-4">Status Codes</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
