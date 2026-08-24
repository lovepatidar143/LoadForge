import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTests } from '../services/api';
import { TestResult } from '../types';
import { formatNumber, formatDuration, formatPercent, formatTimestamp, truncateId, formatLatency } from '../utils/format';
import LoadingSpinner from './LoadingSpinner';
import { CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';

export default function TestHistory() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const data = await listTests();
      setTests(data.tests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-success/10 text-success border border-success/20"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</span>;
      case 'failed': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-danger/10 text-danger border border-danger/20"><XCircle className="w-3 h-3 mr-1"/> Failed</span>;
      case 'running': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20"><Clock className="w-3 h-3 mr-1 animate-spin"/> Running</span>;
      case 'cancelled': return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-warning/10 text-warning border border-warning/20"><AlertCircle className="w-3 h-3 mr-1"/> Cancelled</span>;
      default: return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  if (loading) return <LoadingSpinner message="Loading history..." />;

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Test History</h1>
        <p className="text-slate-400">View past test results and performance reports.</p>
      </div>

      <div className="bg-surface border border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-sm border-b border-slate-700">
                <th className="px-6 py-4 font-medium">Test ID</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Duration</th>
                <th className="px-6 py-4 font-medium">Total Req</th>
                <th className="px-6 py-4 font-medium">Mean RPS</th>
                <th className="px-6 py-4 font-medium">P95 Latency</th>
                <th className="px-6 py-4 font-medium">Error Rate</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {tests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    No tests found.
                  </td>
                </tr>
              ) : (
                tests.map((test) => (
                  <tr 
                    key={test.testId} 
                    onClick={() => navigate(`/history/${test.testId}`)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-mono text-primary">
                      {truncateId(test.testId)}
                    </td>
                    <td className="px-6 py-4 text-sm max-w-[200px] truncate" title={test.config.targetUrl}>
                      <span className="font-semibold text-slate-300 mr-2">{test.config.method}</span>
                      <span className="text-slate-400">{test.config.targetUrl}</span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(test.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {formatDuration(test.actualDurationSeconds * 1000)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {formatNumber(test.totalRequests)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {formatNumber(Math.round(test.meanRps))}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {formatLatency(test.latency?.p95Ms || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={test.errorRate > 0 ? 'text-danger' : 'text-success'}>
                        {formatPercent(test.errorRate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {formatTimestamp(test.startTimeMs)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
