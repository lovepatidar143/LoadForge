import React from 'react';
import { MetricsSnapshot } from '../types';
import { formatNumber, formatLatency, formatPercent } from '../utils/format';
import { Activity, Clock, AlertTriangle, Users } from 'lucide-react';

interface MetricsPanelProps {
  metrics: MetricsSnapshot | null;
}

export default function MetricsPanel({ metrics }: MetricsPanelProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-surface p-4 rounded-xl border border-slate-700 animate-pulse h-28"></div>
        ))}
      </div>
    );
  }

  const errorRate = metrics.totalRequests > 0 
    ? metrics.failedRequests / metrics.totalRequests 
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="bg-surface p-4 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start mb-2">
          <p className="text-slate-400 text-sm font-medium">Current RPS</p>
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <p className="text-3xl font-bold text-white">{formatNumber(Math.round(metrics.currentRps))}</p>
        <p className="text-xs text-slate-400 mt-2">Requests / second</p>
      </div>

      <div className="bg-surface p-4 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start mb-2">
          <p className="text-slate-400 text-sm font-medium">Latency (P95)</p>
          <Clock className="w-4 h-4 text-warning" />
        </div>
        <p className="text-3xl font-bold text-white">{formatLatency(metrics.latency.p95Ms)}</p>
        <p className="text-xs text-slate-400 mt-2">
          P50: {formatLatency(metrics.latency.p50Ms)} | P99: {formatLatency(metrics.latency.p99Ms)}
        </p>
      </div>

      <div className="bg-surface p-4 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start mb-2">
          <p className="text-slate-400 text-sm font-medium">Error Rate</p>
          <AlertTriangle className={`w-4 h-4 ${errorRate > 0 ? 'text-danger' : 'text-success'}`} />
        </div>
        <p className={`text-3xl font-bold ${errorRate > 0 ? 'text-danger' : 'text-success'}`}>
          {formatPercent(errorRate)}
        </p>
        <p className="text-xs text-slate-400 mt-2">
          {formatNumber(metrics.failedRequests)} failed / {formatNumber(metrics.totalRequests)} total
        </p>
      </div>

      <div className="bg-surface p-4 rounded-xl border border-slate-700">
        <div className="flex justify-between items-start mb-2">
          <p className="text-slate-400 text-sm font-medium">Active Conns</p>
          <Users className="w-4 h-4 text-indigo-400" />
        </div>
        <p className="text-3xl font-bold text-white">{formatNumber(metrics.activeConnections)}</p>
        <p className="text-xs text-slate-400 mt-2">Open connections to target</p>
      </div>
    </div>
  );
}
